import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal";

export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, "bad_request", message);

const MAX_BODY_BYTES = 8 * 1024;

/** Reads a small JSON object body. Rejects anything else. */
export async function readJsonObject(c: Context): Promise<Record<string, unknown>> {
  const text = await c.req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new HttpError(413, "bad_request", "body too large");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw badRequest("body must be valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest("body must be a JSON object");
  return value as Record<string, unknown>;
}

/** Strict field readers for request bodies. Unknown keys are rejected by `onlyKeys`. */
export const body = {
  onlyKeys(obj: Record<string, unknown>, allowed: readonly string[]): void {
    for (const key of Object.keys(obj)) if (!allowed.includes(key)) throw badRequest(`unexpected field "${key}"`);
  },
  string(obj: Record<string, unknown>, key: string, opts: { min?: number; max: number; pattern?: RegExp }): string {
    const v = obj[key];
    if (typeof v !== "string") throw badRequest(`"${key}" must be a string`);
    const len = [...v].length;
    if (len < (opts.min ?? 1) || len > opts.max) throw badRequest(`"${key}" has an invalid length`);
    if (opts.pattern && !opts.pattern.test(v)) throw badRequest(`"${key}" is invalid`);
    return v;
  },
  oneOf<T extends string>(obj: Record<string, unknown>, key: string, values: readonly T[]): T {
    const v = obj[key];
    if (typeof v !== "string" || !values.includes(v as T)) throw badRequest(`"${key}" must be one of ${values.join(", ")}`);
    return v as T;
  },
  object(obj: Record<string, unknown>, key: string): Record<string, unknown> {
    const v = obj[key];
    if (!v || typeof v !== "object" || Array.isArray(v)) throw badRequest(`"${key}" must be an object`);
    return v as Record<string, unknown>;
  },
};

export const PATTERNS = {
  publicKey: /^[A-Za-z0-9_-]{43}$/,
  signature: /^[A-Za-z0-9_-]{86}$/,
  nonce: /^[A-Za-z0-9_-]{43}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  appVersion: /^[0-9A-Za-z.+-]{1,32}$/,
};

/** Device names are free text but must not contain control characters. */
export function deviceName(obj: Record<string, unknown>, key = "name"): string {
  const name = body.string(obj, key, { max: 64 }).trim();
  if (!name || /[\u0000-\u001f\u007f]/.test(name)) throw badRequest(`"${key}" is invalid`);
  return name;
}
