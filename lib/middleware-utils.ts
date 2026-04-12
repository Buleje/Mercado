/**
 * lib/middleware-utils.ts
 *
 * Pure, testable utilities used by Next.js Edge Middleware.
 * Extracted so they can be unit-tested without needing the Edge runtime.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  createDistributedRateLimiter,
  type DistributedRateLimiter,
} from "@/lib/rate-limit";

// ── Request ID generation ──────────────────────────────────────────────────────

export function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Nonce generation ───────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random nonce for use in CSP headers.
 * Returns a base64url string so it is safe in HTTP headers and HTML attributes.
 */
export function generateNonce(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    return btoa(String.fromCharCode(...buf))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }
  // Fallback (Node.js environments without Web Crypto)
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ── Admin route protection ─────────────────────────────────────────────────────

const PROTECTED_ADMIN_PREFIX = "/admin";
export const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/setup"];

export function isProtectedAdmin(pathname: string): boolean {
  return (
    pathname.startsWith(PROTECTED_ADMIN_PREFIX) &&
    !PUBLIC_ADMIN_PATHS.some((p) => pathname.startsWith(p))
  );
}

// ── Edge rate limiter (distributed via Upstash Redis REST) ────────────────────
//
// Before ADR-022 (2026-04-09) this file used a per-instance `Map` to track
// request counts. That was broken on Vercel because every edge/lambda replica
// had its own Map, so an attacker bypassed the configured limit × N replicas
// with no coordination across instances.
//
// Now we delegate to `createDistributedRateLimiter` from `lib/rate-limit.ts`,
// which talks to Upstash Redis over REST (edge-compatible). When Upstash env
// vars are absent (dev w/o setup) the factory falls back to an in-memory map
// with a loud warning — same ergonomic as before, but explicit.

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

/**
 * Legacy alias — kept so existing unit tests that import `RateLimitEntry`
 * from this module keep compiling. New code should not reference it.
 */
export type RateLimitEntry = { count: number; resetAt: number };

/**
 * Legacy in-memory store exported only for backward compatibility with
 * `__tests__/middleware-utils.test.ts`. The real rate-limit state now lives
 * either in Upstash (distributed) or in the `fallbackStore` inside
 * `lib/rate-limit.ts`. Tests that mutate this map still work against the
 * pure helper `checkEdgeRateLimit` below.
 *
 * @deprecated Use `createDistributedRateLimiter` from `lib/rate-limit.ts`.
 */
export const rlStore = new Map<string, RateLimitEntry>();

// Singleton limiter for the edge middleware pipeline. Lazy-initialized so
// the Upstash client is only built when the middleware actually fires (and
// so tests that mock `@/lib/rate-limit` get their mock honored).
let _edgeLimiter: DistributedRateLimiter | null = null;
function getEdgeLimiter(): DistributedRateLimiter {
  if (_edgeLimiter) return _edgeLimiter;
  _edgeLimiter = createDistributedRateLimiter({
    key: "mw:api",
    maxRequests: MAX_REQUESTS,
    windowMs: WINDOW_MS,
  });
  return _edgeLimiter;
}

export function getIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Pure helper kept for unit tests and as a building block for the legacy
 * `rlStore`-based path. The production middleware pipeline uses
 * `checkRateLimit` which delegates to Upstash.
 *
 * @deprecated Prefer `createDistributedRateLimiter`.
 */
export function checkEdgeRateLimit(
  map: Map<string, RateLimitEntry>,
  ip: string,
  maxRequests: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const entry = map.get(ip);
  if (!entry || now >= entry.resetAt) {
    map.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

/**
 * Enforce a distributed rate limit on an incoming request.
 *
 * Resolves to a `NextResponse` (status 429) when the caller has exceeded the
 * configured budget, or `null` when the request is allowed. The check is
 * async because it talks to Upstash Redis REST — callers in `proxy.ts`
 * must `await` it.
 *
 * Fail-open: if Upstash is unreachable or misconfigured, the underlying
 * limiter returns `true` (allowed) and logs the incident. This protects
 * against a Redis outage taking the whole site down at the cost of a
 * brief protection gap during the outage.
 */
export async function checkRateLimit(req: NextRequest): Promise<NextResponse | null> {
  const ip = getIP(req);
  const tenantId = req.headers.get("x-tenant-id") ?? "global";
  const identifier = `${tenantId}:${ip}`;

  const limiter = getEdgeLimiter();
  const allowed = await limiter.check(identifier);
  if (allowed) return null;

  return NextResponse.json(
    { error: "Demasiadas solicitudes. Intente de nuevo en un minuto." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(WINDOW_MS / 1000)) },
    },
  );
}

/**
 * Test-only reset of the internal cached limiter. Not part of the public API.
 * @internal
 */
export function __resetEdgeLimiterForTests(): void {
  _edgeLimiter = null;
  rlStore.clear();
}

// ── Content-Security-Policy ───────────────────────────────────────────────────

/**
 * Build a CSP header value.
 *
 * When `nonce` is provided, `script-src` uses `'nonce-{value}'` instead of
 * `'unsafe-inline'`, substantially tightening security.
 *
 * NOTE on 'unsafe-eval': Required by Next.js edge runtime for hydration and
 * dynamic code evaluation in development. Recharts (used in admin dashboards)
 * also relies on eval for its responsive container calculations. Until these
 * dependencies drop eval usage, we cannot remove 'unsafe-eval' without
 * breaking the app. Tracked for future removal when Next.js and Recharts
 * provide eval-free alternatives.
 *
 * Keep `'unsafe-inline'` in `style-src` for Tailwind JIT.
 */
export function buildCSP(pathname: string, nonce?: string): string {
  const isAdminRoute =
    pathname.startsWith("/admin") || pathname.startsWith("/superadmin");

  const scriptSrc = nonce
    ? `'self' 'nonce-${nonce}' 'unsafe-eval' https://va.vercel-scripts.com https://vitals.vercel-insights.com`
    : `'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://vitals.vercel-insights.com`;

  const directives: Record<string, string> = {
    "default-src":               "'self'",
    "script-src":                scriptSrc,
    "style-src":                 "'self' 'unsafe-inline'",
    "img-src":                   "* data: blob:",
    "font-src":                  "'self' data:",
    "connect-src":               "'self' data: https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://region1.google-analytics.com https://clarity.ms https://*.clarity.ms https://nominatim.openstreetmap.org https://va.vercel-scripts.com https://vitals.vercel-insights.com https://api.apis.net.pe https://eldni.com",
    "media-src":                 "'self'",
    "object-src":                "'none'",
    "base-uri":                  "'self'",
    "form-action":               "'self'",
    "frame-ancestors":           isAdminRoute ? "'none'" : "'self'",
    "upgrade-insecure-requests": "",
  };

  return Object.entries(directives)
    .map(([k, v]) => (v ? `${k} ${v}` : k))
    .join("; ");
}
