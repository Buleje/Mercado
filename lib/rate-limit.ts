/**
 * Simple in-memory sliding-window rate limiter.
 * Resets on cold-start (server restart). For single-instance Next.js deployments.
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

// Purge expired entries every 5 minutes to prevent unbounded growth
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now >= entry.resetAt) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * @param key       Unique key (e.g. `"orders:1.2.3.4"`)
 * @param maxReqs   Maximum requests allowed in the window
 * @param windowSec Window size in seconds
 */
export function rateLimit(
  key: string,
  maxReqs: number,
  windowSec: number
): RateLimitResult {
  const now = Date.now();
  const resetAt = now + windowSec * 1000;
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxReqs - 1, resetAt };
  }

  if (entry.count >= maxReqs) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: maxReqs - entry.count, resetAt: entry.resetAt };
}

/** Extract a best-effort client IP from a Next.js request. */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
