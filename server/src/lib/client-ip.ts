/**
 * The client's address, for per-IP rate limits.
 *
 * Behind a hosting proxy (Render, a load balancer) every connection comes from the proxy, so the real client is in
 * X-Forwarded-For. Each proxy appends the address it received the request from, so only the last `trustedProxies`
 * entries were written by infrastructure we trust; anything further left could have been sent by the client itself.
 *
 *   trustedProxies = 0   socket address (no proxy; X-Forwarded-For is ignored)
 *   trustedProxies = 1   last X-Forwarded-For entry (one proxy in front, e.g. Render)
 */
export function resolveClientIp(headers: Headers, socketAddress: string | undefined, trustedProxies: number): string {
  const socket = socketAddress || "unknown";
  if (trustedProxies <= 0) return socket;
  const forwarded = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // [...forwarded, socket]: step back over the trusted hops to the first address a trusted proxy saw.
  const chain = [...forwarded, socket];
  return chain[Math.max(0, chain.length - 1 - trustedProxies)]!;
}
