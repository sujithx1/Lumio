import { and, eq, gt, inArray } from "drizzle-orm";
import type { Database } from "../../db/client";
import { devicePairings, pairingSessions } from "../../db/schema";
import { normalizePairingCode, pairingSas, randomPairingCode, sha256Hex } from "../../lib/crypto";
import { HttpError } from "../../lib/http";
import { serverMessage } from "../../protocol/messages";
import { orderedPair, toSummary, type DeviceRepo, type DeviceRow } from "../devices/repo";
import type { Presence } from "../presence/presence";

export const PAIRING_TTL_MS = 120_000;

const hashCode = (normalized: string) => sha256Hex(`lumio-pair-v1|${normalized}`);

/**
 * QR / typed-code pairing.
 *   initiator: create()  -> shows code
 *   claimant:  claim()   -> initiator gets DEVICE_PAIR_REQUEST with the SAS
 *   initiator: approve() -> both get DEVICE_PAIR_APPROVED   | reject() -> claimant gets DEVICE_PAIR_REJECTED
 * Only a hash of the code is stored; codes are single use and expire after two minutes.
 */
export function createPairingService(deps: { db: Database; repo: DeviceRepo; presence: Presence }) {
  const { db, repo, presence } = deps;

  async function loadOwnedClaimed(pairingId: string, initiatorId: string) {
    const [session] = await db
      .select()
      .from(pairingSessions)
      .where(
        and(
          eq(pairingSessions.id, pairingId),
          eq(pairingSessions.initiatorDeviceId, initiatorId),
          gt(pairingSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return session;
  }

  return {
    async create(initiator: DeviceRow) {
      // A device has at most one open pairing session.
      await db
        .update(pairingSessions)
        .set({ status: "expired" })
        .where(
          and(eq(pairingSessions.initiatorDeviceId, initiator.id), inArray(pairingSessions.status, ["pending", "claimed"])),
        );

      const code = randomPairingCode();
      const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
      const id = Bun.randomUUIDv7();
      await db.insert(pairingSessions).values({
        id,
        initiatorDeviceId: initiator.id,
        codeHash: hashCode(normalizePairingCode(code)!),
        expiresAt,
      });
      return { pairingId: id, code, expiresAt: expiresAt.getTime() };
    },

    async claim(claimant: DeviceRow, rawCode: string) {
      const normalized = normalizePairingCode(rawCode);
      const invalid = new HttpError(404, "not_found", "this code is invalid or has expired");
      if (!normalized) throw invalid;

      const [session] = await db
        .select()
        .from(pairingSessions)
        .where(
          and(
            eq(pairingSessions.codeHash, hashCode(normalized)),
            eq(pairingSessions.status, "pending"),
            gt(pairingSessions.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!session) throw invalid;
      if (session.initiatorDeviceId === claimant.id) throw new HttpError(400, "bad_request", "a device cannot pair with itself");

      const initiator = await repo.findActiveById(session.initiatorDeviceId);
      if (!initiator) throw invalid;
      if (await repo.isPaired(initiator.id, claimant.id)) throw new HttpError(409, "conflict", "these devices are already paired");
      if (!presence.isOnline(initiator.id)) {
        throw new HttpError(409, "conflict", "the other device is offline; keep Lumio open on it and try again");
      }

      // Atomic pending -> claimed so a code can only be claimed once.
      const [claimed] = await db
        .update(pairingSessions)
        .set({ status: "claimed", claimantDeviceId: claimant.id, expiresAt: new Date(Date.now() + PAIRING_TTL_MS) })
        .where(and(eq(pairingSessions.id, session.id), eq(pairingSessions.status, "pending")))
        .returning();
      if (!claimed) throw invalid;

      const sas = pairingSas(normalized, initiator.publicKey, claimant.publicKey);
      presence.send(
        initiator.id,
        serverMessage("DEVICE_PAIR_REQUEST", initiator.id, { pairingId: session.id, claimant: toSummary(claimant), sas }),
      );
      return { pairingId: session.id, sas, initiator: toSummary(initiator), expiresAt: claimed.expiresAt.getTime() };
    },

    async approve(initiator: DeviceRow, pairingId: string) {
      const session = await loadOwnedClaimed(pairingId, initiator.id);
      if (!session || session.status !== "claimed" || !session.claimantDeviceId) {
        throw new HttpError(404, "not_found", "no pending pairing request");
      }
      const claimant = await repo.findActiveById(session.claimantDeviceId);
      if (!claimant) throw new HttpError(404, "not_found", "the other device is no longer available");

      const [a, b] = orderedPair(initiator.id, claimant.id);
      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(pairingSessions)
          .set({ status: "approved" })
          .where(and(eq(pairingSessions.id, session.id), eq(pairingSessions.status, "claimed")))
          .returning({ id: pairingSessions.id });
        if (!updated) throw new HttpError(409, "conflict", "pairing already resolved");
        await tx.insert(devicePairings).values({ id: Bun.randomUUIDv7(), deviceAId: a, deviceBId: b }).onConflictDoNothing();
      });

      const tell = (to: DeviceRow, peer: DeviceRow) =>
        presence.send(
          to.id,
          serverMessage("DEVICE_PAIR_APPROVED", to.id, { pairingId, peer: toSummary(peer), peerPublicKey: peer.publicKey }),
        );
      tell(initiator, claimant);
      tell(claimant, initiator);
      return { pairingId, peer: { ...toSummary(claimant), publicKey: claimant.publicKey } };
    },

    async reject(initiator: DeviceRow, pairingId: string) {
      const session = await loadOwnedClaimed(pairingId, initiator.id);
      if (!session || (session.status !== "claimed" && session.status !== "pending")) {
        throw new HttpError(404, "not_found", "no pending pairing request");
      }
      await db.update(pairingSessions).set({ status: "rejected" }).where(eq(pairingSessions.id, session.id));
      if (session.claimantDeviceId) {
        presence.send(
          session.claimantDeviceId,
          serverMessage("DEVICE_PAIR_REJECTED", session.claimantDeviceId, { pairingId }),
        );
      }
    },
  };
}

export type PairingService = ReturnType<typeof createPairingService>;
