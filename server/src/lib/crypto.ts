import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify, type KeyObject } from "node:crypto";

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

const publicKeyCache = new Map<string, KeyObject>();

function publicKeyObject(publicKey: string): KeyObject {
  let key = publicKeyCache.get(publicKey);
  if (!key) {
    key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicKey }, format: "jwk" });
    if (publicKeyCache.size > 10_000) publicKeyCache.clear();
    publicKeyCache.set(publicKey, key);
  }
  return key;
}

/** Verifies an Ed25519 signature. Keys and signatures are base64url without padding. Never throws. */
export function verifyEd25519(publicKey: string, data: Uint8Array, signature: string): boolean {
  try {
    const sig = Buffer.from(signature, "base64url");
    if (sig.length !== 64) return false;
    return verify(null, data, publicKeyObject(publicKey), sig);
  } catch {
    return false;
  }
}

/** Ed25519 key pair from a 32-byte seed. Used by tests and the device simulator, never by the server itself. */
export function keyPairFromSeed(seed: Uint8Array) {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
  const jwk = createPublicKey(privateKey).export({ format: "jwk" }) as { x: string };
  return {
    publicKey: jwk.x,
    sign: (data: Uint8Array) => sign(null, data, privateKey).toString("base64url"),
  };
}

export const sha256Hex = (input: string | Uint8Array) => createHash("sha256").update(input).digest("hex");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Crockford base32: no I, L, O, U, so codes are easy to read aloud and type. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PAIRING_CODE_LENGTH = 10;

/** A random 10-character pairing code (50 bits), formatted XXXXX-XXXXX. */
export function randomPairingCode(): string {
  const bytes = randomBytes(PAIRING_CODE_LENGTH);
  let out = "";
  for (const b of bytes) out += CROCKFORD[b & 31];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

/** Normalises user input (case, separators, look-alike letters). Returns null if it cannot be a pairing code. */
export function normalizePairingCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  if (cleaned.length !== PAIRING_CODE_LENGTH) return null;
  for (const ch of cleaned) if (!CROCKFORD.includes(ch)) return null;
  return cleaned;
}

/**
 * Short authentication string shown on both devices during pairing.
 * Binds the code to both public keys, so a device that only saw the QR code cannot impersonate either side.
 */
export function pairingSas(code: string, initiatorPublicKey: string, claimantPublicKey: string): string {
  const digest = createHash("sha256").update(`lumio-sas-v1|${code}|${initiatorPublicKey}|${claimantPublicKey}`).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}
