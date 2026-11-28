import { Hono } from "hono";
import pkg from "../package.json" with { type: "json" };
import { createApp } from "./app";
import type { Config } from "./config";
import { createDb } from "./db/client";
import { resolveClientIp } from "./lib/client-ip";
import type { Logger } from "./lib/logger";
import { getConnInfo } from "hono/bun";
import { authRoutes, requireDevice, type AppEnv } from "./modules/auth/routes";
import { ChallengeStore, createTokenService } from "./modules/auth/service";
import { createDeviceRepo } from "./modules/devices/repo";
import { deviceRoutes } from "./modules/devices/routes";
import { createEventRouter } from "./modules/events/router";
import { pairingRoutes } from "./modules/pairing/routes";
import { createPairingService } from "./modules/pairing/service";
import { Presence } from "./modules/presence/presence";
import { transferRoutes } from "./modules/transfers/routes";
import { createTransferService } from "./modules/transfers/service";
import { createGateway, type WsData } from "./modules/websocket/gateway";

const EFFECT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface ServerOptions {
  /**
   * Per-IP limit (requests per minute) for login and pairing-code claims. Default 30.
   * Also raises the per-IP limit on WebSocket AUTH frames (default 40 per 10 s) when larger.
   * Raised only in tests, which register many devices from one address.
   */
  ipRateLimitPerMinute?: number;
}

/** Wires every module together and starts listening. */
export function startServer(config: Config, logger: Logger, options: ServerOptions = {}) {
  const database = createDb(config.databaseUrl);
  const { db } = database;
  const repo = createDeviceRepo(db);
  const presence = new Presence();
  const tokens = createTokenService(config.jwtSecret, config.tokenTtlSeconds);
  const challenges = new ChallengeStore();
  const pairing = createPairingService({ db, repo, presence });
  const router = createEventRouter({ db, repo, presence, logger });
  const transfers = createTransferService({
    db,
    repo,
    presence,
    logger,
    filesDir: config.filesDir,
    maxFileBytes: config.maxFileBytes,
  });
  const gateway = createGateway({
    presence,
    repo,
    tokens,
    router,
    transfers,
    logger,
    preAuthLimit: Math.max(40, options.ipRateLimitPerMinute ?? 0),
    clientIp: (req, srv) => resolveClientIp(req.headers, srv.requestIP(req)?.address, config.trustedProxies),
  });

  const api = new Hono<AppEnv>();
  api.use(async (c, next) => {
    let socket: string | undefined;
    try {
      socket = getConnInfo(c).remote.address;
    } catch {}
    c.set("ip", resolveClientIp(c.req.raw.headers, socket, config.trustedProxies));
    await next();
  });
  const ipLimit = options.ipRateLimitPerMinute ?? 30;
  api.route("/auth", authRoutes({ repo, tokens, challenges, rateLimitPerMinute: ipLimit }));
  const authed = new Hono<AppEnv>();
  authed.use(requireDevice({ repo, tokens }));
  authed.route("/", deviceRoutes({ repo, presence }));
  authed.route("/pairing", pairingRoutes(pairing, ipLimit));
  authed.route("/transfers", transferRoutes(transfers));
  api.route("/", authed);

  const app = createApp({ logger, pingDb: database.ping, version: pkg.version, api });

  const server = Bun.serve<WsData>({
    port: config.port,
    hostname: config.host,
    // File uploads stream through PUT /v1/transfers/:id/content; everything else is small JSON.
    maxRequestBodySize: config.maxFileBytes + 64 * 1024,
    fetch(req, srv) {
      if (new URL(req.url).pathname === "/v1/ws") return gateway.upgrade(req, srv);
      return app.fetch(req, srv);
    },
    websocket: gateway.websocket,
  });

  const sweepTimer = setInterval(() => {
    gateway.sweep();
    void transfers.sweep().catch((err) => logger.error("transfer sweep failed", { err: String(err) }));
  }, 15_000);
  const pruneTimer = setInterval(
    () => void repo.pruneEffects(new Date(Date.now() - EFFECT_RETENTION_MS)).catch(() => {}),
    60 * 60 * 1000,
  );

  return {
    server,
    url: server.url,
    presence,
    db,
    transfers,
    async stop() {
      clearInterval(sweepTimer);
      clearInterval(pruneTimer);
      gateway.closeAll();
      // Bun's stop() can wait on half-closed client sockets; do not let shutdown hang on them.
      await Promise.race([server.stop(true), new Promise((r) => setTimeout(r, 2_000))]);
      // Close handlers run asynchronously after the sockets drop; let them finish their writes.
      await new Promise((r) => setTimeout(r, 50));
      await gateway.drain();
      await database.close();
    },
  };
}
