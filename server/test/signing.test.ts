import { describe, expect, test } from "bun:test";
import vectors from "../../protocol/fixtures/signing/vectors.json" with { type: "json" };
import { keyPairFromSeed, normalizePairingCode, pairingSas, randomPairingCode, verifyEd25519 } from "../src/lib/crypto";
import { canonicalize, signingInput } from "../src/protocol/canonical";
import { parseMessage } from "../src/protocol/validate";

describe("signing vectors (shared with Rust and Dart)", () => {
  const keys = keyPairFromSeed(Buffer.from(vectors.seedHex, "hex"));

  test("seed derives the published public key", () => {
    expect(keys.publicKey).toBe(vectors.publicKey);
  });

  for (const [i, c] of vectors.cases.entries()) {
    test(`case ${i}: ${c.message.type} canonical form, signature and verification`, () => {
      const { sig, ...unsigned } = c.message;
      expect(canonicalize(unsigned)).toBe(c.canonical);
      expect(keys.sign(signingInput(c.message))).toBe(sig);
      expect(verifyEd25519(vectors.publicKey, signingInput(c.message), sig)).toBe(true);
      expect(parseMessage(c.message).ok).toBe(true);
    });
  }

  test("any change to a signed field breaks verification", () => {
    const c = vectors.cases[0]!;
    const tampered = { ...c.message, payload: { ...c.message.payload, intensity: 0.81 } };
    expect(verifyEd25519(vectors.publicKey, signingInput(tampered), c.message.sig)).toBe(false);
  });

  test("canonicalization ignores key order", () => {
    expect(canonicalize({ b: 1, a: { d: true, c: "x" } })).toBe('{"a":{"c":"x","d":true},"b":1}');
  });
});

describe("pairing codes", () => {
  test("random codes are well-formed and normalise to themselves", () => {
    for (let i = 0; i < 200; i++) {
      const code = randomPairingCode();
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
      expect(normalizePairingCode(code)).toBe(code.replace("-", ""));
    }
  });

  test("normalisation forgives case, spaces and look-alike letters", () => {
    expect(normalizePairingCode(" abcde fghjk ")).toBe("ABCDEFGHJK");
    expect(normalizePairingCode("O1IL0-00000")).toBe("0111000000");
  });

  test("rejects wrong lengths and characters outside the alphabet", () => {
    expect(normalizePairingCode("ABCDE")).toBeNull();
    expect(normalizePairingCode("ABCDE-FGHJU")).toBeNull();
  });

  test("SAS is 6 digits and depends on both keys", () => {
    const sas = pairingSas("ABCDEFGHJK", "pk-a", "pk-b");
    expect(sas).toMatch(/^\d{6}$/);
    expect(pairingSas("ABCDEFGHJK", "pk-a", "pk-c")).not.toBe(sas);
  });
});
