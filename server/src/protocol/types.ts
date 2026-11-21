/**
 * TypeScript model of protocol/schemas/message.schema.json.
 * Hand-maintained; kept honest by the shared fixtures in protocol/fixtures (see test/protocol.test.ts).
 */

export const PROTOCOL_VERSION = 1 as const;

/** Maximum allowed expiresAt - createdAt. */
export const MAX_MESSAGE_LIFETIME_MS = 60_000;
/** Tolerated clock difference between devices and the server. */
export const MAX_CLOCK_SKEW_MS = 30_000;
/** Largest raw frame accepted before JSON parsing. */
export const MAX_FRAME_BYTES = 16 * 1024;

export type Uuid = string;
export type DeviceId = Uuid;
export type Address = DeviceId | "server";
export type Platform = "macos" | "windows" | "linux" | "android" | "ios";

export interface DeviceSummary {
  deviceId: DeviceId;
  name: string;
  platform: Platform;
}

interface Envelope<T extends string, P> {
  v: typeof PROTOCOL_VERSION;
  id: Uuid;
  type: T;
  from: Address;
  to: Address;
  createdAt: number;
  expiresAt: number;
  payload: P;
  sig?: string;
}

interface Signed {
  from: DeviceId;
  to: DeviceId;
  sig: string;
}

export type EffectFailureReason =
  | "unknown_effect"
  | "expired"
  | "duplicate"
  | "invalid_signature"
  | "not_paired"
  | "unsupported"
  | "busy"
  | "render_error";

export type EffectRelayStatus = "relayed" | "receiver_offline" | "notified" | "expired" | "rejected";

export type ErrorCode = "bad_request" | "unauthorized" | "forbidden" | "not_found" | "rate_limited" | "internal";

export interface EffectPayload {
  effectId: string;
  duration: number;
  intensity: number;
  sound: boolean;
}

export type AuthMessage = Envelope<"AUTH", { token: string }> & { to: "server" };
export type AuthOkMessage = Envelope<"AUTH_OK", { deviceId: DeviceId; serverTime: number }> & { from: "server" };
export type HeartbeatMessage = Envelope<"HEARTBEAT", Record<string, never>>;
export type DevicePairRequestMessage = Envelope<
  "DEVICE_PAIR_REQUEST",
  { pairingId: Uuid; claimant: DeviceSummary; sas: string }
> & { from: "server" };
export type DevicePairApprovedMessage = Envelope<
  "DEVICE_PAIR_APPROVED",
  { pairingId: Uuid; peer: DeviceSummary; peerPublicKey: string }
> & { from: "server" };
export type DevicePairRejectedMessage = Envelope<"DEVICE_PAIR_REJECTED", { pairingId: Uuid }> & { from: "server" };
export type DevicePairRevokedMessage = Envelope<"DEVICE_PAIR_REVOKED", { peerDeviceId: DeviceId }> & {
  from: "server";
};
export type DeviceOnlineMessage = Envelope<"DEVICE_ONLINE", { deviceId: DeviceId }> & { from: "server" };
export type DeviceOfflineMessage = Envelope<"DEVICE_OFFLINE", { deviceId: DeviceId; lastSeenAt: number }> & {
  from: "server";
};
export type EffectTriggerMessage = Envelope<"EFFECT_TRIGGER", EffectPayload> & Signed;
export type EffectReceivedMessage = Envelope<"EFFECT_RECEIVED", { eventId: Uuid }> & Signed;
export type EffectCompletedMessage = Envelope<"EFFECT_COMPLETED", { eventId: Uuid }> & Signed;
export type EffectFailedMessage = Envelope<"EFFECT_FAILED", { eventId: Uuid; reason: EffectFailureReason }> & Signed;
export type EffectStatusMessage = Envelope<"EFFECT_STATUS", { eventId: Uuid; status: EffectRelayStatus }> & {
  from: "server";
};
export type ErrorMessage = Envelope<"ERROR", { code: ErrorCode; message: string; refId?: Uuid }> & {
  from: "server";
};

export type LumioMessage =
  | AuthMessage
  | AuthOkMessage
  | HeartbeatMessage
  | DevicePairRequestMessage
  | DevicePairApprovedMessage
  | DevicePairRejectedMessage
  | DevicePairRevokedMessage
  | DeviceOnlineMessage
  | DeviceOfflineMessage
  | EffectTriggerMessage
  | EffectReceivedMessage
  | EffectCompletedMessage
  | EffectFailedMessage
  | EffectStatusMessage
  | ErrorMessage;

export type MessageType = LumioMessage["type"];
