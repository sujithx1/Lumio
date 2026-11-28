import { Hono, type Context, type MiddlewareHandler } from "hono";
import { getConnInfo } from "hono/bun";
import { body, deviceName, HttpError, PATTERNS, readJsonObject } from "../../lib/http";
import { RateLimiter } from "../../lib/ratelimit";
import type { Platform } from "../../protocol/types";
import type { DeviceRepo, DeviceRow } from "../devices/repo";
import { toSummary } from "../devices/repo";
import type { ChallengeStore, TokenService } from "./service";

/** `ip` is set by startServer from the socket or X-Forwarded-For (see lib/client-ip.ts). */
export type AppEnv = { Variables: { device: DeviceRow; ip?: string } };

const PLATFORMS: readonly Platform[] = ["macos", "windows", "linux", "android", "ios"];

export function clientIp(c: Context): string {
  const resolved = c.get("ip") as string | undefined;
  if (resolved) return resolved;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

interface AuthDeps {
  repo: DeviceRepo;
  tokens: TokenService;
  challenges: ChallengeStore;
  /** Login attempts per IP per minute. */
  rateLimitPerMinute?: number;
}

/**
 * POST /v1/auth/challenge {publicKey}                         -> {nonce, expiresAt}
 * POST /v1/auth/token {publicKey, nonce, signature, device?}  -> {token, expiresAt, device}
 * Signing `lumio-auth-v1|<nonce>|<publicKey>` proves key possession. Including `device`
 * ({name, platform, appVersion}) registers the key on first use.
 */
export function authRoutes({ repo, tokens, challenges, rateLimitPerMinute = 30 }: AuthDeps) {
  const app = new Hono<AppEnv>();
  const limiter = new RateLimiter(rateLimitPerMinute, 60_000);

  const limit = (c: Context) => {
    if (!limiter.take(clientIp(c))) throw new HttpError(429, "rate_limited", "too many authentication attempts");
  };

  app.post("/challenge", async (c) => {
    limit(c);
    const b = await readJsonObject(c);
    body.onlyKeys(b, ["publicKey"]);
    const publicKey = body.string(b, "publicKey", { max: 43, pattern: PATTERNS.publicKey });
    return c.json(challenges.create(publicKey));
  });

  app.post("/token", async (c) => {
    limit(c);
    const b = await readJsonObject(c);
    body.onlyKeys(b, ["publicKey", "nonce", "signature", "device"]);
    const publicKey = body.string(b, "publicKey", { max: 43, pattern: PATTERNS.publicKey });
    const nonce = body.string(b, "nonce", { max: 43, pattern: PATTERNS.nonce });
    const signature = body.string(b, "signature", { max: 86, pattern: PATTERNS.signature });
    let info: { name: string; platform: Platform; appVersion: string } | undefined;
    if (b.device !== undefined) {
      const d = body.object(b, "device");
      body.onlyKeys(d, ["name", "platform", "appVersion"]);
      info = {
        name: deviceName(d),
        platform: body.oneOf(d, "platform", PLATFORMS),
        appVersion: body.string(d, "appVersion", { max: 32, pattern: PATTERNS.appVersion }),
      };
    }

    if (!challenges.redeem(nonce, publicKey, signature)) {
      throw new HttpError(401, "unauthorized", "invalid or expired challenge");
    }

    let device = await repo.findByPublicKey(publicKey);
    let created = false;
    if (!device) {
      if (!info) throw new HttpError(404, "not_found", "unknown device; include `device` to register");
      device = await repo.create({ publicKey, ...info });
      created = true;
    } else if (device.revokedAt) {
      throw new HttpError(403, "forbidden", "this device has been revoked");
    } else if (info && info.appVersion !== device.appVersion) {
      device = (await repo.update(device.id, { appVersion: info.appVersion })) ?? device;
    }

    const session = await tokens.issue(device.id);
    return c.json({ ...session, device: toSummary(device) }, created ? 201 : 200);
  });

  return app;
}

/** Requires `Authorization: Bearer <token>` for a non-revoked device. */
export function requireDevice({ repo, tokens }: Pick<AuthDeps, "repo" | "tokens">): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const deviceId = token ? await tokens.verify(token) : null;
    const device = deviceId ? await repo.findActiveById(deviceId) : undefined;
    if (!device) throw new HttpError(401, "unauthorized", "missing or invalid session");
    c.set("device", device);
    await next();
  };
}
