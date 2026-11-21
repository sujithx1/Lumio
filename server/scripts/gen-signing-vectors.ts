/**
 * Regenerates protocol/fixtures/signing/vectors.json. Ed25519 is deterministic, so output is stable.
 * The seed below is a PUBLIC TEST VECTOR. Never use it for a real device.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keyPairFromSeed } from "../src/lib/crypto";
import { canonicalize, signingInput } from "../src/protocol/canonical";

const seedHex = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const keys = keyPairFromSeed(Buffer.from(seedHex, "hex"));
const A = "0193a2b4-1c2d-7e3f-8a9b-0c1d2e3f4a5b";
const B = "0193a2b4-5d6e-7f80-9a1b-2c3d4e5f6a7b";
const base = { v: 1, createdAt: 1763712000000, expiresAt: 1763712030000 };

const messages = [
  { ...base, id: "0193a2b6-0000-7000-8000-000000000201", type: "EFFECT_TRIGGER", from: A, to: B, payload: { effectId: "cosmic-portal", duration: 6000, intensity: 0.8, sound: true } },
  { ...base, id: "0193a2b6-0000-7000-8000-000000000202", type: "EFFECT_TRIGGER", from: A, to: B, payload: { sound: false, intensity: 1, duration: 1000, effectId: "rainbow" } },
  { ...base, id: "0193a2b6-0000-7000-8000-000000000203", type: "EFFECT_TRIGGER", from: A, to: B, payload: { effectId: "aurora", duration: 15000, intensity: 0, sound: false } },
  { ...base, id: "0193a2b6-0000-7000-8000-000000000204", type: "EFFECT_TRIGGER", from: A, to: B, payload: { effectId: "lightning", duration: 4000, intensity: 0.35, sound: true } },
  { ...base, id: "0193a2b6-0000-7000-8000-000000000205", type: "EFFECT_RECEIVED", from: B, to: A, payload: { eventId: "0193a2b6-0000-7000-8000-000000000201" } },
  { ...base, id: "0193a2b6-0000-7000-8000-000000000206", type: "EFFECT_FAILED", from: B, to: A, payload: { eventId: "0193a2b6-0000-7000-8000-000000000201", reason: "unknown_effect" } },
];

const cases = messages.map((message) => ({
  canonical: canonicalize(message),
  message: { ...message, sig: keys.sign(signingInput(message)) },
}));

const dir = join(import.meta.dir, "../../protocol/fixtures/signing");
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, "vectors.json"),
  JSON.stringify({ description: "Cross-language signing vectors. TEST KEY ONLY.", seedHex, publicKey: keys.publicKey, cases }, null, 2) + "\n",
);
console.log(`wrote ${cases.length} signing vectors`);
