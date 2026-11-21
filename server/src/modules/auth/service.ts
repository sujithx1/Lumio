import { sign, verify } from "hono/jwt";
import { randomToken, verifyEd25519 } from "../../lib/crypto";

const CHALLENGE_TTL_MS = 60_000;
const MAX_CHALLENGES = 50_000;

/** The exact bytes a device signs to prove it holds its private key. */
export const authSigningInput = (nonce: string, publicKey: string) =>
  new TextEncoder().encode(`synq-auth-v1|${nonce}|${publicKey}`);

/** Single-use, short-lived login challenges, bound to the public key that requested them. */
export class ChallengeStore {
  private readonly challenges = new Map<string, { publicKey: string; expiresAt: number }>();

  create(publicKey: string, now: number = Date.now()): { nonce: string; expiresAt: number } {
    if (this.challenges.size >= MAX_CHALLENGES) this.prune(now);
    const nonce = randomToken(32);
    const expiresAt = now + CHALLENGE_TTL_MS;
    this.challenges.set(nonce, { publicKey, expiresAt });
    return { nonce, expiresAt };
  }

  /** Consumes the nonce (even on failure) and checks the signature. */
  redeem(nonce: string, publicKey: string, signature: string, now: number = Date.now()): boolean {
    const entry = this.challenges.get(nonce);
    this.challenges.delete(nonce);
    if (!entry || entry.publicKey !== publicKey || entry.expiresAt < now) return false;
    return verifyEd25519(publicKey, authSigningInput(nonce, publicKey), signature);
  }

  private prune(now: number): void {
    for (const [nonce, entry] of this.challenges) if (entry.expiresAt < now) this.challenges.delete(nonce);
    if (this.challenges.size >= MAX_CHALLENGES) this.challenges.clear();
  }
}

/** Short-lived HS256 session tokens. `sub` is the device id. */
export function createTokenService(secret: string, ttlSeconds: number) {
  return {
    async issue(deviceId: string): Promise<{ token: string; expiresAt: number }> {
      const iat = Math.floor(Date.now() / 1000);
      const exp = iat + ttlSeconds;
      return { token: await sign({ sub: deviceId, iat, exp, aud: "synq" }, secret, "HS256"), expiresAt: exp * 1000 };
    },
    /** Returns the device id, or null if the token is invalid or expired. */
    async verify(token: string): Promise<string | null> {
      try {
        const payload = await verify(token, secret, "HS256");
        return payload.aud === "synq" && typeof payload.sub === "string" ? payload.sub : null;
      } catch {
        return null;
      }
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
