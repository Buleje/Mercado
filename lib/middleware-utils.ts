/**
 * lib/middleware-utils.ts
 *
 * Pure, testable utilities used by Next.js Edge Middleware.
 * Extracted so they can be unit-tested without needing the Edge runtime.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

// ── Edge rate limiter (in-memory, per-instance) ───────────────────────────────

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

export type RateLimitEntry = { count: number; resetAt: number };

export const rlStore = new Map<string, RateLimitEntry>();
let lastCleanup = Date.now();

function rlCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 300_000) return;
  lastCleanup = now;
  for (const [k, v] of rlStore) {
    if (v.resetAt < now) rlStore.delete(k);
  }
}

export function getIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

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

export function checkRateLimit(req: NextRequest): NextResponse | null {
  rlCleanup();
  const ip = getIP(req);
  const now = Date.now();
  const allowed = checkEdgeRateLimit(rlStore, ip, MAX_REQUESTS, WINDOW_MS, now);
  if (!allowed) {
    const entry = rlStore.get(ip)!;
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intente de nuevo en un minuto." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) },
      },
    );
  }
  return null;
}

// ── Content-Security-Policy ───────────────────────────────────────────────────

/**
 * Build a CSP header value.
 *
 * When `nonce` is provided, `script-src` uses `'nonce-{value}'` instead of
 * `'unsafe-inline'`, substantially tightening security.
 *
 * Keep `'unsafe-eval'` for Next.js hydration (required for edge runtime).
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
    "connect-src":               "* data: https://vitals.vercel-insights.com",
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
