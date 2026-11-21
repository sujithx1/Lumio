import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { effectEvents } from "../../db/schema";
import type { Logger } from "../../lib/logger";
import { RateLimiter } from "../../lib/ratelimit";
import { serverMessage } from "../../protocol/messages";
import type {
  EffectCompletedMessage,
  EffectFailedMessage,
  EffectReceivedMessage,
  EffectRelayStatus,
  EffectTriggerMessage,
  ErrorCode,
} from "../../protocol/types";
import { ReplayGuard } from "../../protocol/validate";
import type { DeviceRepo } from "../devices/repo";
import type { Presence } from "../presence/presence";

type DeviceToDevice = EffectTriggerMessage | EffectReceivedMessage | EffectCompletedMessage | EffectFailedMessage;

/** Per sender: 30 effects/minute. Per sender->receiver pair: 12 effects/minute. */
const SENDER_LIMIT = { capacity: 30, windowMs: 60_000 };
const PAIR_LIMIT = { capacity: 12, windowMs: 60_000 };

/**
 * Routes device-to-device effect messages through the relay.
 * The relay authorises (authenticated sender, active pairing, rate limits, replay) and records delivery state.
 * It does not need to trust or verify the effect itself: receivers verify the sender's signature end to end.
 */
export function createEventRouter(deps: { db: Database; repo: DeviceRepo; presence: Presence; logger: Logger }) {
  const { db, repo, presence, logger } = deps;
  const replay = new ReplayGuard();
  const senderLimiter = new RateLimiter(SENDER_LIMIT.capacity, SENDER_LIMIT.windowMs);
  const pairLimiter = new RateLimiter(PAIR_LIMIT.capacity, PAIR_LIMIT.windowMs);

  const error = (to: string, code: ErrorCode, message: string, refId: string) =>
    presence.send(to, serverMessage("ERROR", to, { code, message, refId }));

  const status = (to: string, eventId: string, value: EffectRelayStatus) =>
    presence.send(to, serverMessage("EFFECT_STATUS", to, { eventId, status: value }));

  async function trigger(msg: EffectTriggerMessage): Promise<void> {
    const { from, to } = msg;
    if (!senderLimiter.take(from) || !pairLimiter.take(`${from}>${to}`)) {
      error(from, "rate_limited", "slow down: too many effects", msg.id);
      return;
    }

    const inserted = await db
      .insert(effectEvents)
      .values({
        id: msg.id,
        senderDeviceId: from,
        receiverDeviceId: to,
        effectId: msg.payload.effectId,
        route: "relay",
        status: "pending",
        createdAt: new Date(msg.createdAt),
        expiresAt: new Date(msg.expiresAt),
      })
      .onConflictDoNothing()
      .returning({ id: effectEvents.id });
    if (inserted.length === 0) {
      error(from, "bad_request", "duplicate event id", msg.id);
      return;
    }

    const delivered = presence.send(to, msg);
    const outcome: EffectRelayStatus = delivered ? "relayed" : "receiver_offline";
    await db.update(effectEvents).set({ status: outcome }).where(eq(effectEvents.id, msg.id));
    status(from, msg.id, outcome);
    logger.debug("effect routed", { eventId: msg.id, effectId: msg.payload.effectId, outcome });
  }

  async function acknowledgement(msg: EffectReceivedMessage | EffectCompletedMessage | EffectFailedMessage) {
    // The ack's sender must be the original receiver, and its recipient the original sender.
    const where = and(
      eq(effectEvents.id, msg.payload.eventId),
      eq(effectEvents.receiverDeviceId, msg.from),
      eq(effectEvents.senderDeviceId, msg.to),
    );
    const now = new Date();
    const patch =
      msg.type === "EFFECT_RECEIVED"
        ? { status: "received" as const, deliveredAt: now }
        : msg.type === "EFFECT_COMPLETED"
          ? { status: "completed" as const, completedAt: now }
          : { status: "failed" as const, failureReason: msg.payload.reason, completedAt: now };
    const updated = await db.update(effectEvents).set(patch).where(where).returning({ id: effectEvents.id });
    if (updated.length === 0) {
      error(msg.from, "not_found", "unknown event", msg.id);
      return;
    }
    presence.send(msg.to, msg);
  }

  return {
    /** Handles a validated, fresh message whose `from` is the authenticated device. */
    async handle(msg: DeviceToDevice, now: number = Date.now()): Promise<void> {
      if (!replay.accept(msg.id, msg.expiresAt, now)) {
        error(msg.from, "bad_request", "duplicate message id", msg.id);
        return;
      }
      if (!(await repo.isPaired(msg.from, msg.to))) {
        error(msg.from, "forbidden", "not paired with that device", msg.id);
        return;
      }
      if (msg.type === "EFFECT_TRIGGER") await trigger(msg);
      else await acknowledgement(msg);
    },
  };
}

export type EventRouter = ReturnType<typeof createEventRouter>;
