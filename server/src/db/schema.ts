import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const platform = pgEnum("platform", ["macos", "windows", "linux", "android", "ios"]);

export const pairingStatus = pgEnum("pairing_status", ["pending", "claimed", "approved", "rejected", "expired"]);

export const effectRoute = pgEnum("effect_route", ["relay", "lan"]);

export const effectStatus = pgEnum("effect_status", [
  "pending",
  "relayed",
  "received",
  "completed",
  "failed",
  "expired",
  "receiver_offline",
  "notified",
  "rejected",
]);

export const transferStatus = pgEnum("transfer_status", [
  "created",
  "ready",
  "offered",
  "delivered",
  "failed",
  "cancelled",
  "expired",
]);

export const overlayMode = pgEnum("overlay_mode", ["fullscreen", "overlay"]);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** A device identity. The device owns the private key; the server only stores the public key. */
export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey(),
    publicKey: text("public_key").notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    platform: platform("platform").notNull(),
    appVersion: varchar("app_version", { length: 32 }).notNull(),
    lanCertFingerprint: text("lan_cert_fingerprint"),
    pushToken: text("push_token"),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [uniqueIndex("devices_public_key_uq").on(t.publicKey)],
);

/** Short-lived pairing session created by the device that shows the QR code. Only a hash of the code is stored. */
export const pairingSessions = pgTable(
  "pairing_sessions",
  {
    id: uuid("id").primaryKey(),
    initiatorDeviceId: uuid("initiator_device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    status: pairingStatus("status").notNull().default("pending"),
    claimantDeviceId: uuid("claimant_device_id").references(() => devices.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("pairing_sessions_initiator_idx").on(t.initiatorDeviceId),
    uniqueIndex("pairing_sessions_code_hash_uq").on(t.codeHash),
  ],
);

/**
 * A trusted relationship between two devices. Stored once per pair with device_a_id < device_b_id.
 * Only one active (non-revoked) row may exist per pair; revoked rows are kept for audit.
 */
export const devicePairings = pgTable(
  "device_pairings",
  {
    id: uuid("id").primaryKey(),
    deviceAId: uuid("device_a_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    deviceBId: uuid("device_b_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    check("device_pairings_ordered", sql`${t.deviceAId} < ${t.deviceBId}`),
    uniqueIndex("device_pairings_active_uq").on(t.deviceAId, t.deviceBId).where(sql`${t.revokedAt} is null`),
    index("device_pairings_a_idx").on(t.deviceAId),
    index("device_pairings_b_idx").on(t.deviceBId),
  ],
);

/** Delivery record for effects routed through the relay. The id is the protocol event id (replay guard). */
export const effectEvents = pgTable(
  "effect_events",
  {
    id: uuid("id").primaryKey(),
    senderDeviceId: uuid("sender_device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    receiverDeviceId: uuid("receiver_device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    effectId: varchar("effect_id", { length: 48 }).notNull(),
    route: effectRoute("route").notNull(),
    status: effectStatus("status").notNull().default("pending"),
    failureReason: varchar("failure_reason", { length: 32 }),
    createdAt: ts("created_at").notNull(),
    expiresAt: ts("expires_at").notNull(),
    deliveredAt: ts("delivered_at"),
    completedAt: ts("completed_at"),
    recordedAt: ts("recorded_at").notNull().defaultNow(),
  },
  (t) => [
    index("effect_events_sender_idx").on(t.senderDeviceId, t.recordedAt.desc()),
    index("effect_events_receiver_idx").on(t.receiverDeviceId, t.recordedAt.desc()),
  ],
);

/**
 * A file in transit through the relay. The bytes live on disk (FILES_DIR/<id>) only until the receiver
 * confirms (FILE_RECEIVED / FILE_FAILED), the transfer is cancelled, or it expires.
 */
export const fileTransfers = pgTable(
  "file_transfers",
  {
    id: uuid("id").primaryKey(),
    senderDeviceId: uuid("sender_device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    receiverDeviceId: uuid("receiver_device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    mime: varchar("mime", { length: 127 }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    status: transferStatus("status").notNull().default("created"),
    failureReason: varchar("failure_reason", { length: 32 }),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    completedAt: ts("completed_at"),
  },
  (t) => [
    index("file_transfers_sender_idx").on(t.senderDeviceId, t.createdAt.desc()),
    index("file_transfers_receiver_idx").on(t.receiverDeviceId, t.createdAt.desc()),
    index("file_transfers_expires_idx").on(t.expiresAt),
  ],
);

/** Per-device preferences (replaces user_settings until user accounts exist). */
export const deviceSettings = pgTable("device_settings", {
  deviceId: uuid("device_id")
    .primaryKey()
    .references(() => devices.id, { onDelete: "cascade" }),
  acceptEffects: boolean("accept_effects").notNull().default(true),
  soundEnabled: boolean("sound_enabled").notNull().default(true),
  overlayMode: overlayMode("overlay_mode").notNull().default("fullscreen"),
  doNotDisturb: boolean("do_not_disturb").notNull().default(false),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
