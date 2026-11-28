import type { Server, ServerWebSocket } from "bun";
import type { Logger } from "../../lib/logger";
import { RateLimiter } from "../../lib/ratelimit";
import { serverMessage } from "../../protocol/messages";
import { MAX_FRAME_BYTES, type ErrorCode, type LumioMessage } from "../../protocol/types";
import { checkFreshness, parseMessage } from "../../protocol/validate";
import type { TokenService } from "../auth/service";
import type { DeviceRepo } from "../devices/repo";
import type { EventRouter } from "../events/router";
import type { Presence } from "../presence/presence";
import type { TransferService } from "../transfers/service";

export interface WsData {
  ip: string;
  deviceId?: string;
  lastSeen: number;
  authTimer?: ReturnType<typeof setTimeout>;
}

export type LumioSocket = ServerWebSocket<WsData>;

/** Close codes (4000-4999 are application-defined). Clients reconnect on all except 4003. */
export const CLOSE = {
  idle: 4000,
  unauthorized: 4001,
  replaced: 4002,
  revoked: 4003,
  protocol: 4004,
  flood: 4008,
} as const;

export const AUTH_TIMEOUT_MS = 5_000;
export const IDLE_TIMEOUT_MS = 45_000;
const LAST_SEEN_WRITE_INTERVAL_MS = 30_000;

interface GatewayDeps {
  presence: Presence;
  repo: DeviceRepo;
  tokens: TokenService;
  router: EventRouter;
  transfers: TransferService;
  logger: Logger;
  /** Frames per 10 s per IP before a socket has authenticated. Default 40; raised in tests. */
  preAuthLimit?: number;
  /** The client's address for an upgrade request. Defaults to the socket address. */
  clientIp?: (req: Request, server: Server<WsData>) => string;
}

/**
 * WebSocket gateway at /v1/ws.
 * 1. Client sends AUTH {token} within 5 s, server replies AUTH_OK.
 * 2. Both sides exchange HEARTBEAT; sockets silent for 45 s are closed.
 * 3. EFFECT_* and FILE_* messages are validated, checked against the authenticated identity and routed.
 */
export function createGateway({
  presence,
  repo,
  tokens,
  router,
  transfers,
  logger,
  preAuthLimit = 40,
  clientIp = (req, server) => server.requestIP(req)?.address ?? "unknown",
}: GatewayDeps) {
  const sockets = new Set<LumioSocket>();
  const floodLimiter = new RateLimiter(40, 10_000);
  const preAuthLimiter = new RateLimiter(preAuthLimit, 10_000);
  const lastSeenWrites = new Map<string, number>();

  const sendError = (ws: LumioSocket, code: ErrorCode, message: string, refId?: string) => {
    const to = ws.data.deviceId ?? "server";
    if (to === "server") return;
    ws.send(JSON.stringify(serverMessage("ERROR", to, refId ? { code, message, refId } : { code, message })));
  };

  const broadcastToPeers = async (deviceId: string, build: (peerId: string) => object) => {
    for (const peerId of await repo.peerIds(deviceId)) presence.send(peerId, build(peerId));
  };

  const touchLastSeen = async (deviceId: string, now: number, force = false) => {
    const last = lastSeenWrites.get(deviceId) ?? 0;
    if (!force && now - last < LAST_SEEN_WRITE_INTERVAL_MS) return;
    lastSeenWrites.set(deviceId, now);
    await repo.update(deviceId, { lastSeenAt: new Date(now) });
  };

  async function authenticate(ws: LumioSocket, msg: LumioMessage) {
    if (msg.type !== "AUTH") {
      ws.close(CLOSE.unauthorized, "authenticate first");
      return;
    }
    const deviceId = await tokens.verify(msg.payload.token);
    const device = deviceId ? await repo.findActiveById(deviceId) : undefined;
    if (!device || msg.from !== device.id) {
      ws.close(CLOSE.unauthorized, "invalid session");
      return;
    }
    clearTimeout(ws.data.authTimer);
    ws.data.deviceId = device.id;

    const previous = presence.register(device.id, ws);
    previous?.close(CLOSE.replaced, "replaced by a newer connection");

    const now = Date.now();
    ws.send(JSON.stringify(serverMessage("AUTH_OK", device.id, { deviceId: device.id, serverTime: now })));
    await touchLastSeen(device.id, now, true);
    if (!previous) await broadcastToPeers(device.id, (peerId) => serverMessage("DEVICE_ONLINE", peerId, { deviceId: device.id }));
    logger.info("device connected", { deviceId: device.id, ip: ws.data.ip });
  }

  async function handleMessage(ws: LumioSocket, raw: string | Buffer) {
    if (typeof raw !== "string") {
      ws.close(CLOSE.protocol, "text frames only");
      return;
    }
    const allowed = ws.data.deviceId ? floodLimiter.take(ws.data.deviceId) : preAuthLimiter.take(ws.data.ip);
    if (!allowed) {
      ws.close(CLOSE.flood, "too many messages");
      return;
    }

    const parsed = parseMessage(raw);
    if (!parsed.ok) {
      if (!ws.data.deviceId) ws.close(CLOSE.unauthorized, "invalid message");
      else sendError(ws, "bad_request", `${parsed.code}: ${parsed.detail}`);
      return;
    }
    const msg = parsed.message;
    const now = Date.now();
    ws.data.lastSeen = now;

    if (!ws.data.deviceId) return authenticate(ws, msg);

    const deviceId = ws.data.deviceId;
    if (msg.from !== deviceId) return sendError(ws, "forbidden", "`from` does not match this session", msg.id);
    const fresh = checkFreshness(msg, now);
    if (!fresh.ok) return sendError(ws, "bad_request", `message ${fresh.reason.replace("_", " ")}`, msg.id);

    switch (msg.type) {
      case "HEARTBEAT":
        ws.send(JSON.stringify(serverMessage("HEARTBEAT", deviceId, {})));
        await touchLastSeen(deviceId, now);
        return;
      case "EFFECT_TRIGGER":
      case "EFFECT_RECEIVED":
      case "EFFECT_COMPLETED":
      case "EFFECT_FAILED":
        if (msg.to === "server") return sendError(ws, "bad_request", "effects are addressed to a device", msg.id);
        return router.handle(msg, now);
      case "FILE_OFFER":
      case "FILE_RECEIVED":
      case "FILE_FAILED":
        return transfers.handle(msg, now);
      default:
        return sendError(ws, "bad_request", `${msg.type} is not accepted from devices`, msg.id);
    }
  }

  async function handleClose(ws: LumioSocket) {
    sockets.delete(ws);
    clearTimeout(ws.data.authTimer);
    const deviceId = ws.data.deviceId;
    if (!deviceId || !presence.unregister(deviceId, ws)) return;
    const now = Date.now();
    lastSeenWrites.delete(deviceId);
    await repo.update(deviceId, { lastSeenAt: new Date(now) });
    await broadcastToPeers(deviceId, (peerId) => serverMessage("DEVICE_OFFLINE", peerId, { deviceId, lastSeenAt: now }));
    logger.info("device disconnected", { deviceId });
  }

  // In-flight handler promises, so shutdown can wait for them before closing the database.
  const inflight = new Set<Promise<void>>();
  const guard = (fn: () => Promise<void>) => {
    const p = fn().catch((err) => logger.error("websocket handler failed", { err: String(err) }));
    inflight.add(p);
    void p.finally(() => inflight.delete(p));
  };

  return {
    /** Upgrades GET /v1/ws. Returns a Response only when the upgrade fails. */
    upgrade(req: Request, server: Server<WsData>): Response | undefined {
      const ip = clientIp(req, server);
      return server.upgrade(req, { data: { ip, lastSeen: Date.now() } })
        ? undefined
        : new Response("expected a WebSocket upgrade", { status: 426 });
    },

    websocket: {
      maxPayloadLength: MAX_FRAME_BYTES,
      idleTimeout: 120,
      open(ws: LumioSocket) {
        sockets.add(ws);
        ws.data.authTimer = setTimeout(() => ws.close(CLOSE.unauthorized, "authentication timeout"), AUTH_TIMEOUT_MS);
      },
      message(ws: LumioSocket, raw: string | Buffer) {
        void guard(() => handleMessage(ws, raw));
      },
      close(ws: LumioSocket) {
        void guard(() => handleClose(ws));
      },
    },

    /** Closes authenticated sockets that have been silent too long. Call periodically. */
    sweep(now: number = Date.now()): void {
      for (const ws of sockets) {
        if (ws.data.deviceId && now - ws.data.lastSeen > IDLE_TIMEOUT_MS) ws.close(CLOSE.idle, "heartbeat timeout");
      }
    },

    /** Closes every socket (used on shutdown; clients reconnect to another instance or later). */
    closeAll(code = 1001, reason = "server shutting down"): void {
      for (const ws of sockets) ws.close(code, reason);
    },

    /** Resolves once every in-flight handler has settled. */
    async drain(): Promise<void> {
      while (inflight.size) await Promise.allSettled([...inflight]);
    },

    get connectionCount() {
      return sockets.size;
    },
  };
}

export type Gateway = ReturnType<typeof createGateway>;
