/**
 * In-memory token-bucket rate limiter. Each key starts full and refills continuously.
 * Single-instance only; swap for a Redis-backed limiter when running more than one server.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(
    private readonly capacity: number,
    private readonly windowMs: number,
    private readonly maxKeys = 100_000,
  ) {}

  /** Consumes one token. Returns false when the key is over its limit. */
  take(key: string, now: number = Date.now()): boolean {
    const refillPerMs = this.capacity / this.windowMs;
    const bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) this.prune(now);
      this.buckets.set(key, { tokens: this.capacity - 1, updatedAt: now });
      return true;
    }
    bucket.tokens = Math.min(this.capacity, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt > this.windowMs) this.buckets.delete(key);
    }
    if (this.buckets.size >= this.maxKeys) this.buckets.clear();
  }
}
