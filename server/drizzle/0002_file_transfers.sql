CREATE TYPE "public"."transfer_status" AS ENUM('created', 'ready', 'offered', 'delivered', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "file_transfers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sender_device_id" uuid NOT NULL,
	"receiver_device_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"size" bigint NOT NULL,
	"mime" varchar(127) NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"status" "transfer_status" DEFAULT 'created' NOT NULL,
	"failure_reason" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "file_transfers" ADD CONSTRAINT "file_transfers_sender_device_id_devices_id_fk" FOREIGN KEY ("sender_device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_transfers" ADD CONSTRAINT "file_transfers_receiver_device_id_devices_id_fk" FOREIGN KEY ("receiver_device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_transfers_sender_idx" ON "file_transfers" USING btree ("sender_device_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "file_transfers_receiver_idx" ON "file_transfers" USING btree ("receiver_device_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "file_transfers_expires_idx" ON "file_transfers" USING btree ("expires_at");