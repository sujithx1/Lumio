import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import schema from "../../protocol/schemas/message.schema.json" with { type: "json" };
import { MAX_FRAME_BYTES } from "../src/protocol/types";
import { checkFreshness, parseMessage, ReplayGuard } from "../src/protocol/validate";

const FIXTURES = join(import.meta.dir, "../../protocol/fixtures");

const load = (kind: "valid" | "invalid") =>
  readdirSync(join(FIXTURES, kind))
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      const { description, message } = JSON.parse(readFileSync(join(FIXTURES, kind, file), "utf8"));
      return { file, description: description as string, message: message as unknown };
    });

describe("shared fixtures", () => {
  const valid = load("valid");
  const invalid = load("invalid");

  test("fixture sets are not empty", () => {
    expect(valid.length).toBeGreaterThan(0);
    expect(invalid.length).toBeGreaterThan(0);
  });

  for (const f of valid) {
    test(`accepts valid/${f.file} (${f.description})`, () => {
      const result = parseMessage(f.message);
      if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
    });
  }

  for (const f of invalid) {
    test(`rejects invalid/${f.file} (${f.description})`, () => {
      expect(parseMessage(f.message).ok).toBe(false);
    });
  }

  test("every message type has at least one valid fixture", () => {
    const covered = new Set(valid.map((f) => (f.message as { type: string }).type));
    for (const type of Object.keys(schema.$defs.MessageTypes.const)) expect(covered).toContain(type);
  });
});

describe("raw frames", () => {
  const trigger = readFileSync(join(FIXTURES, "valid/effect-trigger.json"), "utf8");
  const frame = JSON.stringify(JSON.parse(trigger).message);

  test("parses a valid string frame", () => {
    expect(parseMessage(frame).ok).toBe(true);
  });

  test("rejects malformed JSON", () => {
    expect(parseMessage("{not json")).toMatchObject({ ok: false, code: "malformed_json" });
  });

  test("rejects oversized frames before parsing", () => {
    expect(parseMessage(" ".repeat(MAX_FRAME_BYTES + 1))).toMatchObject({ ok: false, code: "frame_too_large" });
  });

  test("reports unknown types distinctly", () => {
    const msg = { ...JSON.parse(frame), type: "RUN_COMMAND" };
    expect(parseMessage(msg)).toMatchObject({ ok: false, code: "unknown_type" });
  });
});

describe("checkFreshness", () => {
  const now = 1_763_712_000_000;
  const msg = (createdAt: number, expiresAt: number) => ({ createdAt, expiresAt });

  test("accepts a current message", () => {
    expect(checkFreshness(msg(now, now + 30_000), now)).toEqual({ ok: true });
  });
  test("accepts a message just past expiry within skew", () => {
    expect(checkFreshness(msg(now - 40_000, now - 10_000), now).ok).toBe(true);
  });
  test("rejects an expired message beyond skew", () => {
    expect(checkFreshness(msg(now - 90_000, now - 30_001), now)).toEqual({ ok: false, reason: "expired" });
  });
  test("rejects a message from the future beyond skew", () => {
    expect(checkFreshness(msg(now + 30_001, now + 60_000), now)).toEqual({ ok: false, reason: "from_future" });
  });
});

describe("ReplayGuard", () => {
  const now = 1_763_712_000_000;

  test("accepts an id once", () => {
    const guard = new ReplayGuard();
    expect(guard.accept("a", now + 30_000, now)).toBe(true);
    expect(guard.accept("a", now + 30_000, now + 1)).toBe(false);
  });

  test("forgets ids after expiry plus skew", () => {
    const guard = new ReplayGuard(100, 1_000);
    guard.accept("a", now + 10, now);
    expect(guard.accept("b", now + 10, now + 5_000)).toBe(true);
    expect(guard.size).toBe(1);
  });

  test("stays within capacity", () => {
    const guard = new ReplayGuard(3);
    for (const id of ["a", "b", "c", "d"]) guard.accept(id, now + 30_000, now);
    expect(guard.size).toBe(3);
    expect(guard.accept("d", now + 30_000, now)).toBe(false);
  });
});
