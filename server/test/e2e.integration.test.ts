import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { effectEvents, pairingSessions } from "../src/db/schema";
import { runMigrations } from "../src/db/migrate";
import { createLogger } from "../src/lib/logger";
import { startServer } from "../src/server";
import { pair, SimDevice } from "./support/sim-device";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("relay end-to-end (integration)", () => {
  let running: ReturnType<typeof startServer>;
  let base: string;
  const devices: SimDevice[] = [];

  const device = async (name: string, connect = true) => {
    const d = await SimDevice.register(base, { name });
    if (connect) await d.connect();
    devices.push(d);
    return d;
  };

  beforeAll(async () => {
    await runMigrations(url!);
    running = startServer(
      {
        port: 0,
        host: "127.0.0.1",
        databaseUrl: url!,
        logLevel: "error",
        jwtSecret: "test-secret-test-secret-test-secret!!",
        tokenTtlSeconds: 900,
      },
      createLogger("error"),
      { ipRateLimitPerMinute: 10_000 },
    );
    base = running.url.toString().replace(/\/$/, "");
    await running.db.execute(sql`truncate devices, pairing_sessions, device_pairings, effect_events, device_settings cascade`);
  });

  afterAll(async () => {
    for (const d of devices) d.close();
    await running?.stop();
  });

  describe("authentication", () => {
    test("registers on first login and logs in again with the same key", async () => {
      const d = await device("Auth Test", false);
      const again = await SimDevice.login(base, d.keys);
      expect(again.device.deviceId).toBe(d.deviceId);
    });

    test("unknown keys without device info are rejected", async () => {
      const { keyPairFromSeed } = await import("../src/lib/crypto");
      await expect(SimDevice.login(base, keyPairFromSeed(new Uint8Array(32).fill(9)))).rejects.toThrow("404");
    });

    test("a challenge cannot be redeemed twice or with a wrong signature", async () => {
      const d = await device("Nonce Test", false);
      const post = (path: string, body: unknown) =>
        fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const { nonce } = (await (await post("/v1/auth/challenge", { publicKey: d.keys.publicKey })).json()) as { nonce: string };
      const badSig = d.keys.sign(new TextEncoder().encode(`synq-auth-v1|wrong|${d.keys.publicKey}`));
      expect((await post("/v1/auth/token", { publicKey: d.keys.publicKey, nonce, signature: badSig })).status).toBe(401);
      const goodSig = d.keys.sign(new TextEncoder().encode(`synq-auth-v1|${nonce}|${d.keys.publicKey}`));
      // The nonce was consumed by the failed attempt.
      expect((await post("/v1/auth/token", { publicKey: d.keys.publicKey, nonce, signature: goodSig })).status).toBe(401);
    });

    test("API calls need a valid token", async () => {
      const res = await fetch(`${base}/v1/devices`, { headers: { authorization: "Bearer nope" } });
      expect(res.status).toBe(401);
    });

    test("rejects unexpected fields in request bodies", async () => {
      const d = await device("Strict Body", false);
      expect((await d.api("PATCH", "/v1/me", { name: "ok", admin: true })).status).toBe(400);
    });

    test("websocket closes with 4001 on a bad token", async () => {
      const ws = new WebSocket(`${base.replace("http", "ws")}/v1/ws`);
      const closed = new Promise<number>((r) => ws.addEventListener("close", (e) => r(e.code)));
      await new Promise((r) => ws.addEventListener("open", r, { once: true }));
      const now = Date.now();
      ws.send(
        JSON.stringify({
          v: 1,
          id: Bun.randomUUIDv7(),
          type: "AUTH",
          from: "0193a2b4-1c2d-7e3f-8a9b-0c1d2e3f4a5b",
          to: "server",
          createdAt: now,
          expiresAt: now + 10_000,
          payload: { token: "x".repeat(40) },
        }),
      );
      expect(await closed).toBe(4001);
    });
  });

  describe("pairing", () => {
    test("full handshake: both sides see the same SAS and each other's keys", async () => {
      const a = await device("Mac");
      const b = await device("iPhone");
      const created = await a.api("POST", "/v1/pairing");
      expect(created.status).toBe(201);
      expect(created.json.code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);

      // Typing the code in lower case without the dash still works.
      const claim = await b.api("POST", "/v1/pairing/claim", { code: created.json.code.toLowerCase().replace("-", "") });
      expect(claim.status).toBe(200);
      expect(claim.json.initiator).toEqual({ deviceId: a.deviceId, name: "Mac", platform: "linux" });

      const request = await a.next("DEVICE_PAIR_REQUEST");
      expect(request.payload.sas).toBe(claim.json.sas);
      expect(request.payload.claimant.deviceId).toBe(b.deviceId);

      expect((await a.api("POST", `/v1/pairing/${request.payload.pairingId}/approve`)).status).toBe(200);
      const toA = await a.next("DEVICE_PAIR_APPROVED");
      const toB = await b.next("DEVICE_PAIR_APPROVED");
      expect(toA.payload.peerPublicKey).toBe(b.keys.publicKey);
      expect(toB.payload.peerPublicKey).toBe(a.keys.publicKey);

      const list = await a.api("GET", "/v1/devices");
      expect(list.json.devices).toHaveLength(1);
      expect(list.json.devices[0]).toMatchObject({ deviceId: b.deviceId, online: true, publicKey: b.keys.publicKey });
    });

    test("codes are single use", async () => {
      const [a, b, c] = [await device("A1"), await device("B1"), await device("C1")];
      const { code } = await pair(a, b);
      expect((await c.api("POST", "/v1/pairing/claim", { code })).status).toBe(404);
    });

    test("wrong, malformed and expired codes are rejected", async () => {
      const [a, b] = [await device("A2"), await device("B2")];
      expect((await b.api("POST", "/v1/pairing/claim", { code: "00000-00000" })).status).toBe(404);
      expect((await b.api("POST", "/v1/pairing/claim", { code: "not a code!" })).status).toBe(404);
      const created = await a.api("POST", "/v1/pairing");
      await running.db
        .update(pairingSessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(pairingSessions.id, created.json.pairingId));
      expect((await b.api("POST", "/v1/pairing/claim", { code: created.json.code })).status).toBe(404);
    });

    test("a device cannot pair with itself", async () => {
      const a = await device("Solo");
      const created = await a.api("POST", "/v1/pairing");
      expect((await a.api("POST", "/v1/pairing/claim", { code: created.json.code })).status).toBe(400);
    });

    test("claiming fails while the initiator is offline", async () => {
      const a = await device("Offline Host", false);
      const b = await device("B3");
      const created = await a.api("POST", "/v1/pairing");
      expect((await b.api("POST", "/v1/pairing/claim", { code: created.json.code })).status).toBe(409);
    });

    test("rejection notifies the claimant and does not pair", async () => {
      const [a, b] = [await device("A4"), await device("B4")];
      const created = await a.api("POST", "/v1/pairing");
      await b.api("POST", "/v1/pairing/claim", { code: created.json.code });
      const request = await a.next("DEVICE_PAIR_REQUEST");
      expect((await a.api("POST", `/v1/pairing/${request.payload.pairingId}/reject`)).status).toBe(204);
      expect((await b.next("DEVICE_PAIR_REJECTED")).payload.pairingId).toBe(request.payload.pairingId);
      expect((await a.api("GET", "/v1/devices")).json.devices).toHaveLength(0);
    });

    test("only the initiator can approve", async () => {
      const [a, b] = [await device("A5"), await device("B5")];
      const created = await a.api("POST", "/v1/pairing");
      await b.api("POST", "/v1/pairing/claim", { code: created.json.code });
      expect((await b.api("POST", `/v1/pairing/${created.json.pairingId}/approve`)).status).toBe(404);
    });
  });

  describe("effects", () => {
    test("trigger is relayed intact, acks flow back, delivery is recorded", async () => {
      const [a, b] = [await device("Sender"), await device("Receiver")];
      await pair(a, b);

      const sent = a.trigger(b.deviceId, "aurora", { duration: 5000, intensity: 0.65, sound: true });
      const received = await b.next("EFFECT_TRIGGER");
      expect(received).toEqual(sent);
      expect(SimDevice.verify(received, a.keys.publicKey)).toBe(true);
      expect((await a.next("EFFECT_STATUS")).payload).toEqual({ eventId: sent.id, status: "relayed" });

      b.ack("EFFECT_RECEIVED", a.deviceId, sent.id);
      expect((await a.next("EFFECT_RECEIVED")).payload.eventId).toBe(sent.id);
      b.ack("EFFECT_COMPLETED", a.deviceId, sent.id);
      expect((await a.next("EFFECT_COMPLETED")).payload.eventId).toBe(sent.id);

      const [row] = await running.db.select().from(effectEvents).where(eq(effectEvents.id, sent.id));
      expect(row?.status).toBe("completed");

      const recent = await a.api("GET", "/v1/effects/recent");
      expect(recent.json.effects[0]).toMatchObject({ eventId: sent.id, direction: "sent", peerName: "Receiver", status: "completed" });
    });

    test("a tampered trigger fails signature verification at the receiver", async () => {
      const [a, b] = [await device("Signer"), await device("Verifier")];
      await pair(a, b);
      const msg = a.signed(a.envelope("EFFECT_TRIGGER", b.deviceId, { effectId: "rainbow", duration: 3000, intensity: 0.5, sound: false }));
      a.send({ ...msg, payload: { ...msg.payload, effectId: "matrix" } });
      const received = await b.next("EFFECT_TRIGGER");
      expect(SimDevice.verify(received, a.keys.publicKey)).toBe(false);
    });

    test("unpaired devices cannot send effects", async () => {
      const [a, c] = [await device("Stranger A"), await device("Stranger C")];
      const msg = a.trigger(c.deviceId);
      expect((await a.next("ERROR")).payload).toMatchObject({ code: "forbidden", refId: msg.id });
      expect(await c.nothing("EFFECT_TRIGGER")).toBe(true);
    });

    test("spoofed sender, replayed id and expired messages are rejected", async () => {
      const [a, b] = [await device("A6"), await device("B6")];
      await pair(a, b);

      a.send(a.signed({ ...a.envelope("EFFECT_TRIGGER", a.deviceId, { effectId: "rainbow", duration: 2000, intensity: 1, sound: false }), from: b.deviceId, to: a.deviceId }));
      expect((await a.next("ERROR")).payload.code).toBe("forbidden");

      const first = a.trigger(b.deviceId);
      await b.next("EFFECT_TRIGGER");
      await a.next("EFFECT_STATUS");
      a.send(first);
      expect((await a.next("ERROR")).payload).toMatchObject({ code: "bad_request", refId: first.id });

      const now = Date.now();
      const stale = a.signed({ ...a.envelope("EFFECT_TRIGGER", b.deviceId, { effectId: "rainbow", duration: 2000, intensity: 1, sound: false }), createdAt: now - 120_000, expiresAt: now - 90_000 });
      a.send(stale);
      expect((await a.next("ERROR")).payload.message).toContain("expired");
      expect(await b.nothing("EFFECT_TRIGGER")).toBe(true);
    });

    test("offline receivers are reported, not silently dropped", async () => {
      const a = await device("Online");
      const b = await device("Soon Offline");
      await pair(a, b);
      b.close();
      await a.next("DEVICE_OFFLINE", 3000, (m) => m.payload.deviceId === b.deviceId);
      const sent = a.trigger(b.deviceId);
      expect((await a.next("EFFECT_STATUS")).payload).toEqual({ eventId: sent.id, status: "receiver_offline" });
    });

    test("rate limits stop floods between a pair", async () => {
      const [a, b] = [await device("Flooder"), await device("Target")];
      await pair(a, b);
      for (let i = 0; i < 13; i++) a.trigger(b.deviceId, "lightning");
      expect((await a.next("ERROR", 3000, (m) => m.payload.code === "rate_limited")).payload.code).toBe("rate_limited");
    });
  });

  describe("presence and revocation", () => {
    test("peers are told when a device comes online and goes offline", async () => {
      const a = await device("Watcher");
      const b = await device("Flaky");
      await pair(a, b);
      b.close();
      const offline = await a.next("DEVICE_OFFLINE", 3000, (m) => m.payload.deviceId === b.deviceId);
      expect(offline.payload.lastSeenAt).toBeGreaterThan(0);
      await b.connect();
      await a.next("DEVICE_ONLINE", 3000, (m) => m.payload.deviceId === b.deviceId);
    });

    test("a second connection replaces the first", async () => {
      const a = await device("Twice");
      const first = a.closed!;
      await a.connect();
      expect((await first).code).toBe(4002);
    });

    test("unpairing notifies the peer and blocks further effects", async () => {
      const [a, b] = [await device("Unpairer"), await device("Unpaired")];
      await pair(a, b);
      expect((await a.api("DELETE", `/v1/devices/${b.deviceId}`)).status).toBe(204);
      expect((await b.next("DEVICE_PAIR_REVOKED")).payload.peerDeviceId).toBe(a.deviceId);
      a.trigger(b.deviceId);
      expect((await a.next("ERROR")).payload.code).toBe("forbidden");
    });

    test("revoking a device ends its sessions and pairings", async () => {
      const [a, b] = [await device("Lost Phone"), await device("Laptop")];
      await pair(a, b);
      const closed = a.closed!;
      expect((await a.api("DELETE", "/v1/me")).status).toBe(204);
      expect((await closed).code).toBe(4003);
      expect((await b.next("DEVICE_PAIR_REVOKED")).payload.peerDeviceId).toBe(a.deviceId);
      expect((await a.api("GET", "/v1/devices")).status).toBe(401);
      await expect(SimDevice.login(base, a.keys)).rejects.toThrow("403");
    });

    test("renaming is visible to peers", async () => {
      const [a, b] = [await device("Old Name"), await device("Observer")];
      await pair(a, b);
      expect((await a.api("PATCH", "/v1/me", { name: "  New Name  " })).json.name).toBe("New Name");
      expect((await b.api("GET", "/v1/devices")).json.devices[0].name).toBe("New Name");
    });
  });
});
