/**
 * Simple in-memory sliding-window rate limiter.
 * Resets on cold-start (server restart). For single-instance Next.js deployments.
 * Enhanced with presets and better IP detection for production use.
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
 * Rate limit presets for different endpoint types
 */
export const RateLimitPresets = {
  // Strict: 10 requests per 15 minutes (order creation, contact forms)
  STRICT: { maxReqs: 10, windowSec: 15 * 60 },
  
  // Moderate: 20 requests per 5 minutes (search, filters)
  MODERATE: { maxReqs: 20, windowSec: 5 * 60 },
  
  // Generous: 100 requests per minute (read-only APIs)
  GENEROUS: { maxReqs: 100, windowSec: 60 },
  
  // Auth: 3 failed attempts per hour
  AUTH: { maxReqs: 3, windowSec: 60 * 60 },
} as const;

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
  // Try x-forwarded-for (most common with proxies/CDNs)
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  // Try x-real-ip
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Vercel-specific header
  const vercelIp = req.headers.get("x-vercel-forwarded-for");
  if (vercelIp) {
    return vercelIp.split(",")[0].trim();
  }

  // Fallback — treat as localhost (loopback)
  return "127.0.0.1";
}

/**
 * Helper to apply rate limiting with automatic 429 response
 * Returns a Response object if rate limited, null if allowed
 */
export function applyRateLimit(
  req: { headers: { get(name: string): string | null } },
  limiter: FactoryLimiter
): Response | null;
export function applyRateLimit(
  req: { headers: { get(name: string): string | null } },
  preset: keyof typeof RateLimitPresets,
  keyPrefix?: string
): Response | null;
export function applyRateLimit(
  req: { headers: { get(name: string): string | null } },
  limiterOrPreset: FactoryLimiter | keyof typeof RateLimitPresets,
  keyPrefix: string = "api"
): Response | null {
  const ip = getClientIp(req);

  // Factory-limiter path (used in tests and direct middleware usage)
  if (typeof limiterOrPreset !== "string") {
    const allowed = limiterOrPreset.check(ip);
    if (!allowed) {
      const retryAfterSec = Math.ceil(limiterOrPreset.windowMs / 1000);
      return new Response(
        JSON.stringify({
          error: "Too many requests",
          message: "Rate limit exceeded. Please try again later.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": retryAfterSec.toString(),
          },
        }
      );
    }
    return null;
  }

  // Preset string path — skip enforcement outside production
  if (process.env.NODE_ENV !== "production") return null;
  const { maxReqs, windowSec } = RateLimitPresets[limiterOrPreset];
  const result = rateLimit(`${keyPrefix}:${ip}`, maxReqs, windowSec);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    
    return new Response(
      JSON.stringify({
        error: "Too many requests",
        message: "Has excedido el límite de solicitudes. Por favor, intenta más tarde.",
        retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": maxReqs.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
        },
      }
    );
  }

  return null;
}

/**
 * Create rate limit headers to include in successful responses
 */
export function createRateLimitHeaders(result: RateLimitResult, maxReqs: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": maxReqs.toString(),
    "X-RateLimit-Remaining": Math.max(0, result.remaining).toString(),
    "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
  };
}

/** Interface for a factory-style rate limiter instance */
export interface FactoryLimiter {
  check(clientId: string): boolean;
  readonly windowMs: number;
  readonly clients: Map<string, { count: number; resetAt: number }>;
}

/**
 * Factory-style rate limiter — creates an isolated, per-instance limiter.
 * Provides a `check(clientId)` boolean method and purges expired entries on each call.
 */
export function createRateLimiter(opts: { maxRequests: number; windowMs: number }): FactoryLimiter {
  const _clients = new Map<string, { count: number; resetAt: number }>();
  return {
    check(clientId: string): boolean {
      const now = Date.now();
      // Purge expired entries on every check to prevent unbounded growth
      for (const [key, e] of _clients) {
        if (now >= e.resetAt) _clients.delete(key);
      }
      // Zero maxRequests means block everything
      if (opts.maxRequests <= 0) return false;
      const entry = _clients.get(clientId);
      if (!entry) {
        _clients.set(clientId, { count: 1, resetAt: now + opts.windowMs });
        return true;
      }
      if (entry.count >= opts.maxRequests) return false;
      entry.count++;
      return true;
    },
    get windowMs() {
      return opts.windowMs;
    },
    get clients() {
      return _clients;
    },
  };
}

/** Alias: `getClientId` → `getClientIp` for backward compatibility */
export const getClientId = getClientIp;

/**
 * Rate limit presets using `{ maxRequests, windowMs }` format for use with `createRateLimiter`.
 * Use `RateLimitPresets` (with `maxReqs`/`windowSec`) for the lower-level `rateLimit()` function.
 */
export const RATE_LIMIT_PRESETS = {
  STRICT:   { maxRequests: 5,   windowMs: 15 * 60 * 1000 },
  MODERATE: { maxRequests: 50,  windowMs:      60 * 1000 },
  GENEROUS: { maxRequests: 100, windowMs:      60 * 1000 },
  AUTH:     { maxRequests: 3,   windowMs: 60 * 60 * 1000 },
} as const;
