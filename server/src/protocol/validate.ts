import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import schema from "../../../protocol/schemas/message.schema.json" with { type: "json" };
import {
  MAX_CLOCK_SKEW_MS,
  MAX_FRAME_BYTES,
  MAX_MESSAGE_LIFETIME_MS,
  type MessageType,
  type LumioMessage,
} from "./types";

export type ParseErrorCode =
  | "frame_too_large"
  | "malformed_json"
  | "invalid_envelope"
  | "unknown_type"
  | "invalid_message"
  | "invalid_lifetime"
  | "self_addressed";

export type ParseResult =
  | { ok: true; message: LumioMessage }
  | { ok: false; code: ParseErrorCode; detail: string };

const TYPE_TO_DEF = schema.$defs.MessageTypes.const as Record<MessageType, string>;

const ajv = new Ajv2020({ strict: true, allErrors: false });
ajv.addSchema(schema);

const defValidator = (name: string): ValidateFunction => {
  const fn = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
  if (!fn) throw new Error(`protocol schema is missing $defs/${name}`);
  return fn;
};

const validateEnvelope = defValidator("Envelope");
const validators = new Map<string, ValidateFunction>(
  Object.entries(TYPE_TO_DEF).map(([type, def]) => [type, defValidator(def)]),
);

const fail = (code: ParseErrorCode, detail: string): ParseResult => ({ ok: false, code, detail });

const describe = (fn: ValidateFunction): string => {
  const e = fn.errors?.[0];
  return e ? `${e.instancePath || "/"} ${e.message ?? "is invalid"}` : "is invalid";
};

/**
 * Parses and validates an untrusted message.
 * Accepts a raw frame (string) or an already-decoded JSON value.
 * Checks: size, JSON syntax, envelope schema, per-type schema, lifetime, and from != to.
 * Does NOT check freshness against the clock or replay; see checkFreshness and ReplayGuard.
 */
export function parseMessage(input: string | unknown): ParseResult {
  let value: unknown = input;
  if (typeof input === "string") {
    if (Buffer.byteLength(input, "utf8") > MAX_FRAME_BYTES) return fail("frame_too_large", `exceeds ${MAX_FRAME_BYTES} bytes`);
    try {
      value = JSON.parse(input);
    } catch {
      return fail("malformed_json", "frame is not valid JSON");
    }
  }

  if (!validateEnvelope(value)) return fail("invalid_envelope", describe(validateEnvelope));
  const envelope = value as { type: string; from: string; to: string; createdAt: number; expiresAt: number };

  const validator = validators.get(envelope.type);
  if (!validator) return fail("unknown_type", `unknown message type ${JSON.stringify(envelope.type)}`);
  if (!validator(value)) return fail("invalid_message", describe(validator));

  const lifetime = envelope.expiresAt - envelope.createdAt;
  if (lifetime <= 0 || lifetime > MAX_MESSAGE_LIFETIME_MS) {
    return fail("invalid_lifetime", `lifetime must be in (0, ${MAX_MESSAGE_LIFETIME_MS}] ms, got ${lifetime}`);
  }
  if (envelope.from === envelope.to) return fail("self_addressed", "from and to must differ");

  return { ok: true, message: value as LumioMessage };
}

export type FreshnessResult = { ok: true } | { ok: false; reason: "expired" | "from_future" };

/** Rejects messages that have expired or claim to be created in the future, allowing for clock skew. */
export function checkFreshness(
  message: Pick<LumioMessage, "createdAt" | "expiresAt">,
  now: number,
  skew: number = MAX_CLOCK_SKEW_MS,
): FreshnessResult {
  if (message.createdAt > now + skew) return { ok: false, reason: "from_future" };
  if (message.expiresAt + skew < now) return { ok: false, reason: "expired" };
  return { ok: true };
}

/**
 * Remembers message ids until they expire so a message is processed at most once.
 * Entries are evicted after expiresAt + skew; capacity is bounded to cap memory.
 */
export class ReplayGuard {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly capacity = 50_000,
    private readonly skew = MAX_CLOCK_SKEW_MS,
  ) {}

  /** Returns true the first time an id is seen, false for duplicates. */
  accept(id: string, expiresAt: number, now: number): boolean {
    this.evict(now);
    if (this.seen.has(id)) return false;
    if (this.seen.size >= this.capacity) {
      // Map preserves insertion order: drop the oldest entry.
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    this.seen.set(id, expiresAt + this.skew);
    return true;
  }

  get size(): number {
    return this.seen.size;
  }

  private evict(now: number): void {
    for (const [id, until] of this.seen) {
      if (until < now) this.seen.delete(id);
    }
  }
}
