CREATE TYPE "public"."effect_route" AS ENUM('relay', 'lan');--> statement-breakpoint
CREATE TYPE "public"."effect_status" AS ENUM('pending', 'relayed', 'received', 'completed', 'failed', 'expired', 'receiver_offline', 'notified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."overlay_mode" AS ENUM('fullscreen', 'overlay');--> statement-breakpoint
CREATE TYPE "public"."pairing_status" AS ENUM('pending', 'claimed', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('macos', 'windows', 'linux', 'android', 'ios');--> statement-breakpoint
CREATE TABLE "device_pairings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_a_id" uuid NOT NULL,
	"device_b_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "device_pairings_ordered" CHECK ("device_pairings"."device_a_id" < "device_pairings"."device_b_id")
);
--> statement-breakpoint
CREATE TABLE "device_settings" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"accept_effects" boolean DEFAULT true NOT NULL,
	"sound_enabled" boolean DEFAULT true NOT NULL,
	"overlay_mode" "overlay_mode" DEFAULT 'fullscreen' NOT NULL,
	"do_not_disturb" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"name" varchar(64) NOT NULL,
	"platform" "platform" NOT NULL,
	"app_version" varchar(32) NOT NULL,
	"lan_cert_fingerprint" text,
	"push_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "effect_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sender_device_id" uuid NOT NULL,
	"receiver_device_id" uuid NOT NULL,
	"effect_id" varchar(48) NOT NULL,
	"route" "effect_route" NOT NULL,
	"status" "effect_status" DEFAULT 'pending' NOT NULL,
	"failure_reason" varchar(32),
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairing_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"initiator_device_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"status" "pairing_status" DEFAULT 'pending' NOT NULL,
	"claimant_device_id" uuid,
	"claim_attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_device_a_id_devices_id_fk" FOREIGN KEY ("device_a_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_device_b_id_devices_id_fk" FOREIGN KEY ("device_b_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_settings" ADD CONSTRAINT "device_settings_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "effect_events" ADD CONSTRAINT "effect_events_sender_device_id_devices_id_fk" FOREIGN KEY ("sender_device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "effect_events" ADD CONSTRAINT "effect_events_receiver_device_id_devices_id_fk" FOREIGN KEY ("receiver_device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_sessions" ADD CONSTRAINT "pairing_sessions_initiator_device_id_devices_id_fk" FOREIGN KEY ("initiator_device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_sessions" ADD CONSTRAINT "pairing_sessions_claimant_device_id_devices_id_fk" FOREIGN KEY ("claimant_device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_pairings_active_uq" ON "device_pairings" USING btree ("device_a_id","device_b_id") WHERE "device_pairings"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "device_pairings_a_idx" ON "device_pairings" USING btree ("device_a_id");--> statement-breakpoint
CREATE INDEX "device_pairings_b_idx" ON "device_pairings" USING btree ("device_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_public_key_uq" ON "devices" USING btree ("public_key");--> statement-breakpoint
CREATE INDEX "effect_events_sender_idx" ON "effect_events" USING btree ("sender_device_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "effect_events_receiver_idx" ON "effect_events" USING btree ("receiver_device_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pairing_sessions_initiator_idx" ON "pairing_sessions" USING btree ("initiator_device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pairing_sessions_code_hash_uq" ON "pairing_sessions" USING btree ("code_hash");