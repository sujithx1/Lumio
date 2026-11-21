import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { devicePairings, devices, effectEvents } from "../src/db/schema";

const url = process.env.TEST_DATABASE_URL;

// Integration tests need a disposable Postgres database (`make db-up` creates lumio_test).
describe.skipIf(!url)("database schema (integration)", () => {
  const conn = url ? createDb(url) : undefined;
  const db = conn!.db;

  const ids = [Bun.randomUUIDv7(), Bun.randomUUIDv7(), Bun.randomUUIDv7()].sort();
  const [a, b, c] = ids as [string, string, string];

  beforeAll(async () => {
    await runMigrations(url!);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate devices, pairing_sessions, device_pairings, effect_events, device_settings cascade`);
    await db.insert(devices).values(
      ids.map((id, i) => ({
        id,
        publicKey: `pk-${i}-${id}`,
        name: `Device ${i}`,
        platform: "macos" as const,
        appVersion: "0.1.0",
      })),
    );
  });

  afterAll(async () => {
    await conn?.close();
  });

  test("rejects duplicate public keys", async () => {
    const dup = db.insert(devices).values({ id: Bun.randomUUIDv7(), publicKey: `pk-0-${a}`, name: "x", platform: "ios", appVersion: "0.1.0" });
    await expect(dup.execute()).rejects.toThrow();
  });

  test("enforces device_a_id < device_b_id", async () => {
    const reversed = db.insert(devicePairings).values({ id: Bun.randomUUIDv7(), deviceAId: b, deviceBId: a });
    await expect(reversed.execute()).rejects.toThrow();
  });

  test("allows only one active pairing per pair, but re-pairing after revocation", async () => {
    const first = Bun.randomUUIDv7();
    await db.insert(devicePairings).values({ id: first, deviceAId: a, deviceBId: b });
    await expect(db.insert(devicePairings).values({ id: Bun.randomUUIDv7(), deviceAId: a, deviceBId: b }).execute()).rejects.toThrow();

    await db.update(devicePairings).set({ revokedAt: new Date() }).where(eq(devicePairings.id, first));
    await db.insert(devicePairings).values({ id: Bun.randomUUIDv7(), deviceAId: a, deviceBId: b });

    const rows = await db.select().from(devicePairings);
    expect(rows).toHaveLength(2);
  });

  test("effect event ids are unique (server-side replay guard)", async () => {
    const event = {
      id: Bun.randomUUIDv7(),
      senderDeviceId: a,
      receiverDeviceId: c,
      effectId: "cosmic-portal",
      route: "relay" as const,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30_000),
    };
    await db.insert(effectEvents).values(event);
    await expect(db.insert(effectEvents).values(event).execute()).rejects.toThrow();
  });

  test("deleting a device cascades to its pairings", async () => {
    await db.insert(devicePairings).values({ id: Bun.randomUUIDv7(), deviceAId: a, deviceBId: c });
    await db.delete(devices).where(eq(devices.id, a));
    expect(await db.select().from(devicePairings)).toHaveLength(0);
  });
});
