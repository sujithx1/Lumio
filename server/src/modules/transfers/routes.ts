import { Hono } from "hono";
import { badRequest, body, HttpError, PATTERNS, readJsonObject } from "../../lib/http";
import type { AppEnv } from "../auth/routes";
import type { TransferService } from "./service";

/** Same rules as protocol/schemas FileName / MimeType / Sha256. */
const FILE_NAME = /^[^\u0000-\u001f\u007f/\\]+$/;
const MIME = /^[A-Za-z0-9][A-Za-z0-9.+_-]*\/[A-Za-z0-9][A-Za-z0-9.+_-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;

const uuidParam = (id: string) => {
  if (!PATTERNS.uuid.test(id)) throw badRequest("invalid transfer id");
  return id;
};

/**
 * POST   /v1/transfers               {to, name, size, mime, sha256} -> 201 {transferId, expiresAt, maxBytes}
 * PUT    /v1/transfers/:id/content   raw bytes (sender only)        -> 204
 * GET    /v1/transfers/:id/content   raw bytes (receiver only)
 * DELETE /v1/transfers/:id           cancel (either side)           -> 204
 */
export function transferRoutes(transfers: TransferService) {
  const app = new Hono<AppEnv>();

  app.get("/limits", (c) => c.json({ maxBytes: transfers.maxFileBytes }));

  app.post("/", async (c) => {
    const b = await readJsonObject(c);
    body.onlyKeys(b, ["to", "name", "size", "mime", "sha256"]);
    const to = body.string(b, "to", { max: 36, pattern: PATTERNS.uuid });
    const name = body.string(b, "name", { max: 255, pattern: FILE_NAME });
    if (name === "." || name === "..") throw badRequest('"name" is invalid');
    const mime = body.string(b, "mime", { max: 127, pattern: MIME });
    const sha256 = body.string(b, "sha256", { min: 64, max: 64, pattern: SHA256 });
    const size = b.size;
    if (typeof size !== "number" || !Number.isInteger(size) || size < 0) throw badRequest('"size" must be a non-negative integer');

    const row = await transfers.create(c.get("device").id, { to, name, size, mime, sha256 });
    return c.json({ transferId: row.id, expiresAt: row.expiresAt.getTime(), maxBytes: transfers.maxFileBytes }, 201);
  });

  app.put("/:id/content", async (c) => {
    const declared = c.req.header("content-length");
    if (declared && Number(declared) > transfers.maxFileBytes) throw new HttpError(413, "bad_request", "file too large");
    await transfers.upload(c.get("device").id, uuidParam(c.req.param("id")), c.req.raw.body);
    return c.body(null, 204);
  });

  app.get("/:id/content", async (c) => {
    const { row, file } = await transfers.download(c.get("device").id, uuidParam(c.req.param("id")));
    // Always served as opaque bytes: the receiver decides what to do with the file, never the browser/webview.
    return new Response(file, {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(row.size),
        "content-disposition": "attachment",
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      },
    });
  });

  app.delete("/:id", async (c) => {
    await transfers.cancel(c.get("device").id, uuidParam(c.req.param("id")));
    return c.body(null, 204);
  });

  return app;
}
