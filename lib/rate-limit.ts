/**
 * lib/rate-limit.ts
 *
 * Rate limiting module for Buleje ERP.
 *
 * Two APIs live here:
 *
 *  1. **Distributed rate limiter (Upstash Redis REST)** — the new primary path.
 *     Use `createDistributedRateLimiter({ key, maxRequests, windowMs })` to
 *     build an edge-compatible limiter that shares state across all Vercel
 *     instances via Upstash. This is what `lib/middleware-utils.ts#checkRateLimit`
 *     uses in the Next.js 16 Routing Middleware (proxy.ts).
 *
 *     Requires env vars:
 *       - UPSTASH_REDIS_REST_URL
 *       - UPSTASH_REDIS_REST_TOKEN
 *
 *     If those env vars are missing, the factory falls back to an in-memory
 *     implementation (the same Map-based limiter as the legacy API below) and
 *     logs a warning once per instance. In `NODE_ENV=production` the warning
 *     is escalated to `logger.error` so the gap is loud in observability.
 *
 *  2. **Legacy in-memory rate limiter** — kept for backward compatibility
 *     with route handlers that were written before the distributed migration
 *     (ADR-022, 2026-04-09). These are sync and use a per-process `Map`:
 *       - `rateLimit(key, maxReqs, windowSec)`
 *       - `createRateLimiter({ maxRequests, windowMs })` → sync `FactoryLimiter`
 *       - `applyRateLimit(req, limiter|preset, prefix?)`
 *       - `getClientIp(req)` / `getClientId` alias
 *
 *     These remain safe to use for *per-instance* smoothing (e.g. the sync
 *     route-handler fast path) but SHOULD NOT be treated as a security
 *     boundary. The real DoS protection lives in the distributed path on the
 *     edge middleware.
 *
 * Edge-compatible: `@upstash/ratelimit` + `@upstash/redis` use fetch, not
 * node-specific modules, so they run correctly under the Vercel Edge runtime
 * that executes Next.js 16 Routing Middleware.
 *
 * See `docs/adr/022-upstash-rate-limit-distribuido.md` for the decision record.
 */

import { logger } from "@/lib/logger";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ════════════════════════════════════════════════════════════════════════════
// Distributed rate limiter (Upstash Redis REST) — primary API
// ════════════════════════════════════════════════════════════════════════════

/**
 * Configuration accepted by `createDistributedRateLimiter`.
 *
 * @property key          Logical namespace for this limiter — prepended to
 *                        every Redis key so unrelated limiters don't collide
 *                        (e.g. `"mw:api"`, `"auth:login"`).
 * @property maxRequests  Max requests allowed inside `windowMs`.
 * @property windowMs     Sliding window size in milliseconds.
 */
export interface DistributedRateLimitConfig {
  key: string;
  maxRequests: number;
  windowMs: number;
}

/**
 * Shape returned by `createDistributedRateLimiter`.
 *
 * All methods are async because the underlying Upstash call is a network
 * fetch. When running in fallback mode (no env vars) the calls still return
 * Promises for a stable API.
 */
export interface DistributedRateLimiter {
  /** Returns `true` if `identifier` is allowed, `false` if throttled. */
  check(identifier: string): Promise<boolean>;
  /** Remaining requests in the current window for `identifier`. */
  remaining(identifier: string): Promise<number>;
  /** Window size in milliseconds (echoed from config, useful for Retry-After). */
  readonly windowMs: number;
  /** `true` when the limiter is backed by Upstash; `false` when using the in-memory fallback. */
  readonly distributed: boolean;
}

// ── Singleton Redis client (lazy) ─────────────────────────────────────────────
//
// The Upstash REST client is cheap to construct but we still memoize it so
// every `createDistributedRateLimiter` call shares the same underlying client.
// This also makes it easy to check the "fallback active" condition in a
// single place.

let _redisClient: Redis | null = null;
let _redisResolved = false;
let _fallbackLogged = false;

function getRedisClient(): Redis | null {
  if (_redisResolved) return _redisClient;
  _redisResolved = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    _redisClient = null;
    logFallbackOnce();
    return null;
  }

  try {
    _redisClient = new Redis({ url, token });
    return _redisClient;
  } catch (err) {
    _redisClient = null;
    logger.error("[rate-limit] Failed to initialize Upstash Redis client", {
      error: err instanceof Error ? err.message : String(err),
    });
    logFallbackOnce();
    return null;
  }
}

function logFallbackOnce(): void {
  if (_fallbackLogged) return;
  _fallbackLogged = true;
  const isProd = process.env.NODE_ENV === "production";
  const msg =
    "[rate-limit] Upstash Redis env vars missing — using in-memory fallback. " +
    "Distributed rate limiting is DISABLED. Set UPSTASH_REDIS_REST_URL and " +
    "UPSTASH_REDIS_REST_TOKEN for cross-instance protection.";
  if (isProd) {
    logger.error(msg);
  } else {
    logger.warn(msg);
  }
}

// ── Per-instance in-memory fallback used when Upstash is absent ───────────────

interface FallbackEntry {
  count: number;
  resetAt: number;
}

/**
 * Namespaced in-memory store. Keyed by `${config.key}:${identifier}` so two
 * limiters with different `key` namespaces never collide even when they share
 * the same process.
 *
 * NOTE: This is the exact behavior of the legacy `Map` rate limiter — it is
 * only safe per instance. We keep it here so dev (and tests) don't need a
 * live Upstash account.
 */
const fallbackStore = new Map<string, FallbackEntry>();

function fallbackCheck(
  namespace: string,
  identifier: string,
  maxRequests: number,
  windowMs: number,
  now: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  if (maxRequests <= 0) {
    return { allowed: false, remaining: 0, resetAt: now + windowMs };
  }

  const compoundKey = `${namespace}:${identifier}`;

  // Opportunistic cleanup of ≤1 expired entry per call keeps the map bounded
  // without an interval timer (timers don't survive cold starts on Vercel).
  for (const [key, entry] of fallbackStore) {
    if (entry.resetAt < now) {
      fallbackStore.delete(key);
      break;
    }
  }

  const entry = fallbackStore.get(compoundKey);
  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowMs;
    fallbackStore.set(compoundKey, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Test helper — clears the in-memory fallback store. NOT exported to the
 * public API surface; only the tests in `__tests__/rate-limit.test.ts` and
 * `__tests__/middleware-utils.test.ts` use it via a direct re-import.
 *
 * @internal
 */
export function __resetDistributedRateLimitFallback(): void {
  fallbackStore.clear();
  _fallbackLogged = false;
  _redisClient = null;
  _redisResolved = false;
}

/**
 * Build a rate limiter that — when Upstash env vars are set — uses Upstash
 * Redis REST via `@upstash/ratelimit` for cross-instance protection. When
 * env vars are missing, degrades to an in-memory fallback with a one-time
 * warning (error-level in production).
 *
 * Example:
 *
 * ```ts
 * const limiter = createDistributedRateLimiter({
 *   key: "mw:api",
 *   maxRequests: 60,
 *   windowMs: 60_000,
 * });
 *
 * if (!(await limiter.check(ip))) {
 *   return new Response("429", { status: 429 });
 * }
 * ```
 */
export function createDistributedRateLimiter(
  config: DistributedRateLimitConfig,
): DistributedRateLimiter {
  const redis = getRedisClient();

  if (!redis) {
    // In-memory fallback path. `distributed: false` so callers can branch if
    // they care (e.g. add a warning banner to /api/admin/health).
    return {
      async check(identifier: string): Promise<boolean> {
        const res = fallbackCheck(
          config.key,
          identifier,
          config.maxRequests,
          config.windowMs,
          Date.now(),
        );
        return res.allowed;
      },
      async remaining(identifier: string): Promise<number> {
        const compoundKey = `${config.key}:${identifier}`;
        const entry = fallbackStore.get(compoundKey);
        if (!entry || Date.now() >= entry.resetAt) return config.maxRequests;
        return Math.max(0, config.maxRequests - entry.count);
      },
      windowMs: config.windowMs,
      distributed: false,
    };
  }

  // `@upstash/ratelimit` expects the window as a Duration string like
  // "60 s" / "15 m". We translate milliseconds → the most appropriate unit.
  const windowDuration = msToUpstashDuration(config.windowMs);

  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.maxRequests, windowDuration),
    // `prefix` makes every Redis key start with `"buleje:rl:<key>"` so we never
    // collide with other Upstash consumers on the same DB.
    prefix: `buleje:rl:${config.key}`,
    analytics: false,
  });

  return {
    async check(identifier: string): Promise<boolean> {
      try {
        const result = await ratelimit.limit(identifier);
        return result.success;
      } catch (err) {
        // On network failure, FAIL OPEN so we don't block legitimate traffic
        // when Upstash has an outage. Log at error level so alerting fires.
        logger.error("[rate-limit] Upstash call failed — failing open", {
          error: err instanceof Error ? err.message : String(err),
          key: config.key,
        });
        return true;
      }
    },
    async remaining(identifier: string): Promise<number> {
      try {
        const result = await ratelimit.limit(identifier);
        return result.remaining;
      } catch {
        return config.maxRequests;
      }
    },
    windowMs: config.windowMs,
    distributed: true,
  };
}

/**
 * Translate a millisecond window to the Duration string literal expected by
 * `@upstash/ratelimit`. Prefers the largest unit that produces an integer
 * value so Upstash bucket boundaries align with obvious human intervals.
 *
 * Exported only for tests.
 */
export function msToUpstashDuration(ms: number): `${number} ${"ms" | "s" | "m" | "h" | "d"}` {
  if (ms <= 0) return "1 s";
  if (ms % 86_400_000 === 0) return `${ms / 86_400_000} d`;
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000} h`;
  if (ms % 60_000 === 0) return `${ms / 60_000} m`;
  if (ms % 1000 === 0) return `${ms / 1000} s`;
  return `${ms} ms`;
}

// ════════════════════════════════════════════════════════════════════════════
// Legacy in-memory rate limiter — backward compatibility
// ════════════════════════════════════════════════════════════════════════════
//
// Everything below is the pre-ADR-022 API kept for the route handlers that
// already consume it (auth/login, orders, newsletter, …). These run in the
// Node.js runtime (not edge) so a per-instance Map is acceptable *if* paired
// with the distributed edge check in proxy.ts — together they give one global
// barrier + N local smoothers.
//
// DO NOT ADD NEW CALLERS to this API. Use `createDistributedRateLimiter`.

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

// Purge expired entries every 5 minutes to prevent unbounded growth.
// Guarded so test/edge envs without setInterval don't throw.
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

/** Rate limit presets for different endpoint types */
export const RateLimitPresets = {
  STRICT: { maxReqs: 10, windowSec: 15 * 60 },
  MODERATE: { maxReqs: 20, windowSec: 5 * 60 },
  GENEROUS: { maxReqs: 100, windowSec: 60 },
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
  windowSec: number,
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
  return {
    allowed: true,
    remaining: maxReqs - entry.count,
    resetAt: entry.resetAt,
  };
}

/** Extract a best-effort client IP from a Next.js request. */
export function getClientIp(req: {
  headers: { get(name: string): string | null };
}): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  const vercelIp = req.headers.get("x-vercel-forwarded-for");
  if (vercelIp) {
    return vercelIp.split(",")[0].trim();
  }

  return "127.0.0.1";
}

/**
 * Helper to apply rate limiting with automatic 429 response
 * Returns a Response object if rate limited, null if allowed
 */
export function applyRateLimit(
  req: { headers: { get(name: string): string | null } },
  limiter: FactoryLimiter,
): Response | null;
export function applyRateLimit(
  req: { headers: { get(name: string): string | null } },
  preset: keyof typeof RateLimitPresets,
  keyPrefix?: string,
): Response | null;
export function applyRateLimit(
  req: { headers: { get(name: string): string | null } },
  limiterOrPreset: FactoryLimiter | keyof typeof RateLimitPresets,
  keyPrefix: string = "api",
): Response | null {
  const ip = getClientIp(req);

  // Factory-limiter path
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
        },
      );
    }
    return null;
  }

  // F5+F6: enforzar RL en TODOS los entornos (staging detecta abuse pre-prod).
  // tenantId se acepta como 4to parametro opcional para no depender del header
  // falsificable x-tenant-id. Los callers con auth verificada pasan tenantId directo.
  const { maxReqs, windowSec } = RateLimitPresets[limiterOrPreset];
  const tenantId = (keyPrefix !== "api" ? keyPrefix.split(":")[0] : null) ?? req.headers.get("x-tenant-id") ?? "global";
  const result = rateLimit(`${keyPrefix}:${tenantId}:${ip}`, maxReqs, windowSec);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);

    return new Response(
      JSON.stringify({
        error: "Too many requests",
        message:
          "Has excedido el límite de solicitudes. Por favor, intenta más tarde.",
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
      },
    );
  }

  return null;
}

/**
 * Round 8 (2026-05-09 — security M002): doble barrera independiente IP + tenantId.
 *
 * Use cases: endpoints sensibles donde un atacante podría rotar IPs (botnet,
 * proxy rotativo) para vaciar el bucket por IP. La segunda barrera por
 * tenantId tiene ventana más larga y es independiente — limita el daño
 * agregado al recurso aunque la fuente cambie.
 *
 * Caller MUST pass a tenantId verificado (auth.tenantId), NO el header
 * x-tenant-id falsificable.
 *
 * @example
 *   const rl = applyRateLimitWithTenant(req, "STRICT", auth.tenantId, "verify-chain");
 *   if (rl) return rl;
 */
export function applyRateLimitWithTenant(
  req: { headers: { get(name: string): string | null } },
  preset: keyof typeof RateLimitPresets,
  tenantId: string,
  keyPrefix: string,
  tenantOpts?: { maxReqs: number; windowSec: number },
): Response | null {
  // Bucket 1: por IP (ventana corta, presets normales)
  const ipResult = applyRateLimit(req, preset, keyPrefix);
  if (ipResult) return ipResult;

  // Bucket 2: por tenantId (default 30 req/hora — independiente de IP)
  const { maxReqs, windowSec } = tenantOpts ?? { maxReqs: 30, windowSec: 60 * 60 };
  const result = rateLimit(`${keyPrefix}:tenant:${tenantId}`, maxReqs, windowSec);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return new Response(
      JSON.stringify({
        error: "Too many requests",
        message: "Límite por tenant excedido. Intenta más tarde.",
        retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Scope": "tenant",
        },
      },
    );
  }

  return null;
}

/** Create rate limit headers to include in successful responses */
export function createRateLimitHeaders(
  result: RateLimitResult,
  maxReqs: number,
): Record<string, string> {
  return {
    "X-RateLimit-Limit": maxReqs.toString(),
    "X-RateLimit-Remaining": Math.max(0, result.remaining).toString(),
    "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
  };
}

/** Interface for a factory-style rate limiter instance (legacy sync API) */
export interface FactoryLimiter {
  check(clientId: string): boolean;
  readonly windowMs: number;
  readonly clients: Map<string, { count: number; resetAt: number }>;
}

/**
 * Factory-style rate limiter — creates an isolated, per-instance limiter.
 * Provides a `check(clientId)` boolean method and purges expired entries on
 * each call.
 *
 * **Legacy sync API — prefer `createDistributedRateLimiter` for new code.**
 */
export function createRateLimiter(opts: {
  maxRequests: number;
  windowMs: number;
}): FactoryLimiter {
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
 * Rate limit presets using `{ maxRequests, windowMs }` format for use with
 * `createRateLimiter`. Use `RateLimitPresets` (with `maxReqs`/`windowSec`)
 * for the lower-level `rateLimit()` function.
 */
export const RATE_LIMIT_PRESETS = {
  STRICT: { maxRequests: 5, windowMs: 15 * 60 * 1000 },
  MODERATE: { maxRequests: 50, windowMs: 60 * 1000 },
  GENEROUS: { maxRequests: 100, windowMs: 60 * 1000 },
  AUTH: { maxRequests: 3, windowMs: 60 * 60 * 1000 },
} as const;
