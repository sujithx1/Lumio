import { Hono } from "hono";
import { body, HttpError, PATTERNS, readJsonObject } from "../../lib/http";
import { RateLimiter } from "../../lib/ratelimit";
import { clientIp, type AppEnv } from "../auth/routes";
import type { PairingService } from "./service";

/**
 * POST /v1/pairing               start a session (initiator)   -> {pairingId, code, expiresAt}
 * POST /v1/pairing/claim {code}  claim a code (claimant)        -> {pairingId, sas, initiator, expiresAt}
 * POST /v1/pairing/:id/approve   approve (initiator)            -> {pairingId, peer}
 * POST /v1/pairing/:id/reject    decline (initiator)            -> 204
 */
export function pairingRoutes(pairing: PairingService, ipRateLimitPerMinute = 30) {
  const app = new Hono<AppEnv>();
  const createLimiter = new RateLimiter(10, 60_000);
  const claimLimiter = new RateLimiter(10, 60_000);
  const claimIpLimiter = new RateLimiter(ipRateLimitPerMinute, 60_000);

  const pairingId = (raw: string) => {
    if (!PATTERNS.uuid.test(raw)) throw new HttpError(400, "bad_request", "invalid pairing id");
    return raw;
  };

  app.post("/", async (c) => {
    if (!createLimiter.take(c.get("device").id)) throw new HttpError(429, "rate_limited", "too many pairing sessions");
    return c.json(await pairing.create(c.get("device")), 201);
  });

  app.post("/claim", async (c) => {
    const device = c.get("device");
    // Limit both per device and per address so brute-forcing codes is impractical.
    if (!claimLimiter.take(`d:${device.id}`) || !claimIpLimiter.take(clientIp(c))) {
      throw new HttpError(429, "rate_limited", "too many attempts; wait a minute");
    }
    const b = await readJsonObject(c);
    body.onlyKeys(b, ["code"]);
    return c.json(await pairing.claim(device, body.string(b, "code", { max: 32 })));
  });

  app.post("/:id/approve", async (c) => c.json(await pairing.approve(c.get("device"), pairingId(c.req.param("id")))));

  app.post("/:id/reject", async (c) => {
    await pairing.reject(c.get("device"), pairingId(c.req.param("id")));
    return c.body(null, 204);
  });

  return app;
}
