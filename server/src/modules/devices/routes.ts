import { Hono } from "hono";
import { deviceName, HttpError, PATTERNS, readJsonObject, body } from "../../lib/http";
import { serverMessage } from "../../protocol/messages";
import type { AppEnv } from "../auth/routes";
import type { Presence } from "../presence/presence";
import { toSummary, type DeviceRepo } from "./repo";

interface DeviceDeps {
  repo: DeviceRepo;
  presence: Presence;
}

/**
 * GET    /v1/me                 this device
 * PATCH  /v1/me {name}          rename this device
 * DELETE /v1/me                 revoke this device (all pairings end, sessions stop working)
 * GET    /v1/devices            paired devices with presence
 * DELETE /v1/devices/:id        unpair
 * GET    /v1/effects/recent     recent effects sent or received
 */
export function deviceRoutes({ repo, presence }: DeviceDeps) {
  const app = new Hono<AppEnv>();

  const notifyRevoked = (peerId: string, revokedId: string) =>
    presence.send(peerId, serverMessage("DEVICE_PAIR_REVOKED", peerId, { peerDeviceId: revokedId }));

  app.get("/me", (c) => {
    const d = c.get("device");
    return c.json({ ...toSummary(d), appVersion: d.appVersion, createdAt: d.createdAt.getTime() });
  });

  app.patch("/me", async (c) => {
    const b = await readJsonObject(c);
    body.onlyKeys(b, ["name"]);
    const updated = await repo.update(c.get("device").id, { name: deviceName(b) });
    if (!updated) throw new HttpError(404, "not_found", "device not found");
    return c.json(toSummary(updated));
  });

  app.delete("/me", async (c) => {
    const me = c.get("device").id;
    const peers = await repo.revokeDevice(me);
    for (const peer of peers) notifyRevoked(peer, me);
    presence.disconnect(me, 4003, "device revoked");
    return c.body(null, 204);
  });

  app.get("/devices", async (c) => {
    const me = c.get("device").id;
    const peers = await repo.peers(me);
    return c.json({
      devices: peers.map(({ device, pairedAt }) => ({
        ...toSummary(device),
        publicKey: device.publicKey,
        online: presence.isOnline(device.id),
        lastSeenAt: device.lastSeenAt?.getTime() ?? null,
        pairedAt: pairedAt.getTime(),
      })),
    });
  });

  app.delete("/devices/:id", async (c) => {
    const me = c.get("device").id;
    const peerId = c.req.param("id");
    if (!PATTERNS.uuid.test(peerId)) throw new HttpError(400, "bad_request", "invalid device id");
    if (!(await repo.revokePairing(me, peerId))) throw new HttpError(404, "not_found", "not paired with that device");
    notifyRevoked(peerId, me);
    return c.body(null, 204);
  });

  app.get("/effects/recent", async (c) => c.json({ effects: await repo.recentEffects(c.get("device").id) }));

  return app;
}
