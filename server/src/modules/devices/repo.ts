import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { devicePairings, devices, deviceSettings, effectEvents } from "../../db/schema";
import type { Platform } from "../../protocol/types";

export type DeviceRow = typeof devices.$inferSelect;

/** Pairings are stored once per pair, with the smaller id first. */
export const orderedPair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

export function createDeviceRepo(db: Database) {
  const activePairWhere = (me: string) =>
    and(or(eq(devicePairings.deviceAId, me), eq(devicePairings.deviceBId, me)), isNull(devicePairings.revokedAt));

  const repo = {
    async findById(id: string): Promise<DeviceRow | undefined> {
      const [row] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
      return row;
    },

    async findActiveById(id: string): Promise<DeviceRow | undefined> {
      const row = await repo.findById(id);
      return row && !row.revokedAt ? row : undefined;
    },

    async findByPublicKey(publicKey: string): Promise<DeviceRow | undefined> {
      const [row] = await db.select().from(devices).where(eq(devices.publicKey, publicKey)).limit(1);
      return row;
    },

    async create(input: { publicKey: string; name: string; platform: Platform; appVersion: string }): Promise<DeviceRow> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(devices)
          .values({ id: Bun.randomUUIDv7(), ...input })
          .returning();
        if (!row) throw new Error("device insert returned no row");
        await tx.insert(deviceSettings).values({ deviceId: row.id });
        return row;
      });
    },

    async update(id: string, patch: Partial<Pick<DeviceRow, "name" | "appVersion" | "lastSeenAt">>): Promise<DeviceRow | undefined> {
      const [row] = await db.update(devices).set(patch).where(eq(devices.id, id)).returning();
      return row;
    },

    async revokeDevice(id: string): Promise<string[]> {
      return db.transaction(async (tx) => {
        await tx.update(devices).set({ revokedAt: new Date() }).where(eq(devices.id, id));
        const rows = await tx
          .update(devicePairings)
          .set({ revokedAt: new Date() })
          .where(activePairWhere(id))
          .returning({ a: devicePairings.deviceAId, b: devicePairings.deviceBId });
        return rows.map((r) => (r.a === id ? r.b : r.a));
      });
    },

    async peerIds(me: string): Promise<string[]> {
      const rows = await db
        .select({ a: devicePairings.deviceAId, b: devicePairings.deviceBId })
        .from(devicePairings)
        .where(activePairWhere(me));
      return rows.map((r) => (r.a === me ? r.b : r.a));
    },

    async peers(me: string): Promise<Array<{ device: DeviceRow; pairedAt: Date }>> {
      const pairs = await db
        .select({ a: devicePairings.deviceAId, b: devicePairings.deviceBId, createdAt: devicePairings.createdAt })
        .from(devicePairings)
        .where(activePairWhere(me));
      if (pairs.length === 0) return [];
      const pairedAt = new Map(pairs.map((p) => [p.a === me ? p.b : p.a, p.createdAt]));
      const rows = await db
        .select()
        .from(devices)
        .where(and(inArray(devices.id, [...pairedAt.keys()]), isNull(devices.revokedAt)))
        .orderBy(devices.name);
      return rows.map((device) => ({ device, pairedAt: pairedAt.get(device.id)! }));
    },

    async isPaired(x: string, y: string): Promise<boolean> {
      const [a, b] = orderedPair(x, y);
      const [row] = await db
        .select({ id: devicePairings.id })
        .from(devicePairings)
        .where(and(eq(devicePairings.deviceAId, a), eq(devicePairings.deviceBId, b), isNull(devicePairings.revokedAt)))
        .limit(1);
      return Boolean(row);
    },

    async revokePairing(x: string, y: string): Promise<boolean> {
      const [a, b] = orderedPair(x, y);
      const rows = await db
        .update(devicePairings)
        .set({ revokedAt: new Date() })
        .where(and(eq(devicePairings.deviceAId, a), eq(devicePairings.deviceBId, b), isNull(devicePairings.revokedAt)))
        .returning({ id: devicePairings.id });
      return rows.length > 0;
    },

    async recentEffects(me: string, limit = 20) {
      const rows = await db
        .select()
        .from(effectEvents)
        .where(or(eq(effectEvents.senderDeviceId, me), eq(effectEvents.receiverDeviceId, me)))
        .orderBy(desc(effectEvents.recordedAt))
        .limit(limit);
      const peerIds = [...new Set(rows.map((r) => (r.senderDeviceId === me ? r.receiverDeviceId : r.senderDeviceId)))];
      const names = peerIds.length
        ? new Map(
            (await db.select({ id: devices.id, name: devices.name }).from(devices).where(inArray(devices.id, peerIds))).map(
              (d) => [d.id, d.name],
            ),
          )
        : new Map<string, string>();
      return rows.map((r) => {
        const outgoing = r.senderDeviceId === me;
        const peerId = outgoing ? r.receiverDeviceId : r.senderDeviceId;
        return {
          eventId: r.id,
          direction: outgoing ? ("sent" as const) : ("received" as const),
          peerDeviceId: peerId,
          peerName: names.get(peerId) ?? "Unknown device",
          effectId: r.effectId,
          status: r.status,
          route: r.route,
          at: r.recordedAt.getTime(),
        };
      });
    },

    /** Removes delivery records older than the retention window. */
    async pruneEffects(olderThan: Date): Promise<number> {
      const rows = await db
        .delete(effectEvents)
        .where(sql`${effectEvents.recordedAt} < ${olderThan}`)
        .returning({ id: effectEvents.id });
      return rows.length;
    },
  };
  return repo;
}

export type DeviceRepo = ReturnType<typeof createDeviceRepo>;

export const toSummary = (d: DeviceRow) => ({ deviceId: d.id, name: d.name, platform: d.platform });
