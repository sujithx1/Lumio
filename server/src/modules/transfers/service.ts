import { and, eq, inArray, lt } from "drizzle-orm";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Database } from "../../db/client";
import { fileTransfers } from "../../db/schema";
import { HttpError } from "../../lib/http";
import type { Logger } from "../../lib/logger";
import { RateLimiter } from "../../lib/ratelimit";
import { serverMessage } from "../../protocol/messages";
import type { ErrorCode, FileFailedMessage, FileOfferMessage, FileReceivedMessage } from "../../protocol/types";
import { ReplayGuard } from "../../protocol/validate";
import type { DeviceRepo } from "../devices/repo";
import type { Presence } from "../presence/presence";

/** How long an uploaded file waits on the relay for the receiver. */
export const TRANSFER_TTL_MS = 30 * 60_000;
/** Undelivered transfers a sender may have at once. */
export const MAX_PENDING_PER_SENDER = 50;
/** New transfers per sender per minute. */
const CREATE_LIMIT = { capacity: 120, windowMs: 60_000 };

type TransferRow = typeof fileTransfers.$inferSelect;
type FileMessage = FileOfferMessage | FileReceivedMessage | FileFailedMessage;

const OPEN = ["created", "ready", "offered"] as const;

export interface NewTransfer {
  to: string;
  name: string;
  size: number;
  mime: string;
  sha256: string;
}

interface Deps {
  db: Database;
  repo: DeviceRepo;
  presence: Presence;
  logger: Logger;
  filesDir: string;
  maxFileBytes: number;
}

/**
 * File sharing through the relay.
 *
 * 1. Sender: POST /v1/transfers (metadata), then PUT /v1/transfers/:id/content (the bytes).
 *    The relay checks the byte count and SHA-256 against the metadata before marking it ready.
 * 2. Sender: signed FILE_OFFER over the WebSocket. The relay checks it matches the stored transfer and forwards it.
 * 3. Receiver: verifies the sender's signature, GET /v1/transfers/:id/content, re-checks size and SHA-256 against the
 *    signed offer, then sends FILE_RECEIVED or FILE_FAILED. The relay deletes the bytes and forwards the result.
 *
 * Files are deleted as soon as the transfer completes, is cancelled or expires (TRANSFER_TTL_MS).
 */
export function createTransferService({ db, repo, presence, logger, filesDir, maxFileBytes }: Deps) {
  const replay = new ReplayGuard();
  const createLimiter = new RateLimiter(CREATE_LIMIT.capacity, CREATE_LIMIT.windowMs);
  const uploading = new Set<string>();
  // The id is a server-generated UUID, so it is always safe as a file name.
  const pathFor = (id: string) => join(filesDir, id);

  const ready = mkdir(filesDir, { recursive: true }).then(async () => {
    // Partial uploads from a previous run can never complete.
    for (const name of await readdir(filesDir)) if (name.endsWith(".part")) await rm(join(filesDir, name), { force: true });
  });

  const removeFile = (id: string) => rm(pathFor(id), { force: true }).catch(() => {});

  const find = async (id: string): Promise<TransferRow | undefined> =>
    (await db.select().from(fileTransfers).where(eq(fileTransfers.id, id)).limit(1))[0];

  const error = (to: string, code: ErrorCode, message: string, refId: string) =>
    presence.send(to, serverMessage("ERROR", to, { code, message, refId }));

  /** Moves an open transfer to a final state and deletes its bytes. Returns false if it was not open. */
  async function close(id: string, status: "delivered" | "failed" | "cancelled" | "expired", failureReason?: string) {
    const updated = await db
      .update(fileTransfers)
      .set({ status, failureReason: failureReason ?? null, completedAt: new Date() })
      .where(and(eq(fileTransfers.id, id), inArray(fileTransfers.status, [...OPEN])))
      .returning({ id: fileTransfers.id });
    await removeFile(id);
    return updated.length > 0;
  }

  return {
    ready,
    maxFileBytes,

    async create(senderId: string, input: NewTransfer): Promise<TransferRow> {
      if (!createLimiter.take(senderId)) throw new HttpError(429, "rate_limited", "too many files, slow down");
      if (input.size > maxFileBytes) throw new HttpError(413, "bad_request", `files are limited to ${maxFileBytes} bytes`);
      if (input.to === senderId) throw new HttpError(400, "bad_request", "cannot send a file to yourself");
      if (!(await repo.isPaired(senderId, input.to))) throw new HttpError(403, "forbidden", "not paired with that device");

      const pending = await db
        .select({ id: fileTransfers.id })
        .from(fileTransfers)
        .where(and(eq(fileTransfers.senderDeviceId, senderId), inArray(fileTransfers.status, [...OPEN])))
        .limit(MAX_PENDING_PER_SENDER);
      if (pending.length >= MAX_PENDING_PER_SENDER) {
        throw new HttpError(429, "rate_limited", "too many files waiting to be delivered");
      }

      const [row] = await db
        .insert(fileTransfers)
        .values({
          id: Bun.randomUUIDv7(),
          senderDeviceId: senderId,
          receiverDeviceId: input.to,
          name: input.name,
          size: input.size,
          mime: input.mime,
          sha256: input.sha256,
          expiresAt: new Date(Date.now() + TRANSFER_TTL_MS),
        })
        .returning();
      return row!;
    },

    /** Streams the request body to disk, checking it against the declared size and hash. */
    async upload(senderId: string, id: string, body: ReadableStream<Uint8Array> | null): Promise<void> {
      await ready;
      const row = await find(id);
      if (!row || row.senderDeviceId !== senderId) throw new HttpError(404, "not_found", "transfer not found");
      if (row.status !== "created") throw new HttpError(409, "conflict", "this file was already uploaded");
      if (row.expiresAt.getTime() < Date.now()) throw new HttpError(410, "not_found", "transfer expired");
      if (uploading.has(id)) throw new HttpError(409, "conflict", "upload already in progress");

      uploading.add(id);
      const part = `${pathFor(id)}.part`;
      const writer = Bun.file(part).writer();
      const hasher = new Bun.CryptoHasher("sha256");
      let bytes = 0;
      const reader = body?.getReader();
      try {
        // An explicit reader rather than `for await`: a client that disconnects mid-upload surfaces here as a
        // rejected read (an interrupted upload, not a server fault).
        for (;;) {
          if (!reader) break;
          let next: Awaited<ReturnType<typeof reader.read>>;
          try {
            next = await reader.read();
          } catch {
            throw new HttpError(400, "bad_request", "upload interrupted");
          }
          if (next.done) break;
          const chunk = next.value;
          bytes += chunk.byteLength;
          if (bytes > row.size) throw new HttpError(413, "bad_request", "more bytes than declared");
          hasher.update(chunk);
          writer.write(chunk);
        }
        await writer.end();
        if (bytes !== row.size) throw new HttpError(400, "bad_request", "fewer bytes than declared");
        if (hasher.digest("hex") !== row.sha256) throw new HttpError(400, "bad_request", "sha256 does not match");
        await rename(part, pathFor(id));
        await db
          .update(fileTransfers)
          .set({ status: "ready" })
          .where(and(eq(fileTransfers.id, id), eq(fileTransfers.status, "created")));
      } catch (err) {
        await reader?.cancel().catch(() => {});
        await Promise.resolve(writer.end()).catch(() => {});
        await rm(part, { force: true }).catch(() => {});
        throw err;
      } finally {
        uploading.delete(id);
      }
    },

    /** The stored file, for its receiver. */
    async download(receiverId: string, id: string): Promise<{ row: TransferRow; file: ReturnType<typeof Bun.file> }> {
      const row = await find(id);
      if (!row || row.receiverDeviceId !== receiverId) throw new HttpError(404, "not_found", "transfer not found");
      if (row.status !== "ready" && row.status !== "offered") throw new HttpError(410, "not_found", "file is no longer available");
      const file = Bun.file(pathFor(id));
      if (!(await file.exists())) throw new HttpError(410, "not_found", "file is no longer available");
      return { row, file };
    },

    /** Either side may cancel an open transfer. */
    async cancel(deviceId: string, id: string): Promise<void> {
      const row = await find(id);
      if (!row || (row.senderDeviceId !== deviceId && row.receiverDeviceId !== deviceId)) {
        throw new HttpError(404, "not_found", "transfer not found");
      }
      await close(id, "cancelled");
    },

    /** Handles a validated, fresh FILE_* message whose `from` is the authenticated device. */
    async handle(msg: FileMessage, now: number = Date.now()): Promise<void> {
      if (!replay.accept(msg.id, msg.expiresAt, now)) return void error(msg.from, "bad_request", "duplicate message id", msg.id);
      if (!(await repo.isPaired(msg.from, msg.to))) return void error(msg.from, "forbidden", "not paired with that device", msg.id);

      const row = await find(msg.payload.transferId);

      if (msg.type === "FILE_OFFER") {
        const p = msg.payload;
        const matches =
          row &&
          row.senderDeviceId === msg.from &&
          row.receiverDeviceId === msg.to &&
          row.name === p.name &&
          row.size === p.size &&
          row.mime === p.mime &&
          row.sha256 === p.sha256;
        if (!matches) return void error(msg.from, "not_found", "no uploaded file matches this offer", msg.id);
        if (row.status !== "ready" && row.status !== "offered") {
          return void error(msg.from, "bad_request", "file is not ready to offer", msg.id);
        }
        if (!presence.send(msg.to, msg)) return void error(msg.from, "not_found", "receiver is offline", msg.id);
        await db.update(fileTransfers).set({ status: "offered" }).where(eq(fileTransfers.id, row.id));
        logger.debug("file offered", { transferId: row.id, size: row.size });
        return;
      }

      // FILE_RECEIVED / FILE_FAILED: only the receiver can settle a transfer, and only towards its sender.
      if (!row || row.receiverDeviceId !== msg.from || row.senderDeviceId !== msg.to) {
        return void error(msg.from, "not_found", "unknown transfer", msg.id);
      }
      const settled =
        msg.type === "FILE_RECEIVED" ? await close(row.id, "delivered") : await close(row.id, "failed", msg.payload.reason);
      if (!settled) return void error(msg.from, "bad_request", "transfer already finished", msg.id);
      presence.send(msg.to, msg);
    },

    /** Expires transfers nobody collected. Call periodically. */
    async sweep(now: number = Date.now()): Promise<number> {
      const stale = await db
        .select({ id: fileTransfers.id })
        .from(fileTransfers)
        .where(and(lt(fileTransfers.expiresAt, new Date(now)), inArray(fileTransfers.status, [...OPEN])));
      for (const { id } of stale) await close(id, "expired");
      return stale.length;
    },
  };
}

export type TransferService = ReturnType<typeof createTransferService>;
