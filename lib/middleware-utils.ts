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
 * Presupuesto aparte para la LECTURA del drive (`GET /api/admin/documents/*`).
 *
 * Mirar una carpeta del panel gasta muchas requests baratas: la miniatura de
 * cada archivo, el archivo servido en la vista previa, la ficha, las versiones.
 * Con el techo general de 60/min, revisar una carpeta de 300 documentos moría a
 * los pocos archivos con un 429 — y el visor lo dibujaba como si fuera el
 * contenido del archivo. Sólo aplica a GET: las mutaciones (subir, borrar,
 * compartir) siguen con el techo general.
 */
const DRIVE_READ_MAX_REQUESTS = 300;
const DRIVE_READ_PREFIX = "/api/admin/documents";

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

/** Limitador propio de la lectura del drive — namespace y cupo aparte. */
let _driveReadLimiter: DistributedRateLimiter | null = null;
function getDriveReadLimiter(): DistributedRateLimiter {
  if (_driveReadLimiter) return _driveReadLimiter;
  _driveReadLimiter = createDistributedRateLimiter({
    key: "mw:drive-read",
    maxRequests: DRIVE_READ_MAX_REQUESTS,
    windowMs: WINDOW_MS,
  });
  return _driveReadLimiter;
}

/** ¿Es una lectura del drive (le corresponde el cupo grande)? */
export function esLecturaDeDrive(req: NextRequest): boolean {
  return req.method === "GET" && req.nextUrl.pathname.startsWith(DRIVE_READ_PREFIX);
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

  const limiter = esLecturaDeDrive(req) ? getDriveReadLimiter() : getEdgeLimiter();
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
  _driveReadLimiter = null;
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
  // frame-ancestors:
  //  - admin/superadmin → 'none' (jamás embebibles, ni same-origin).
  //  - resto (incl. storefronts /t/[slug]/*) → 'self': permite el preview en
  //    vivo del editor (StoreCustomizer embebe /t/<slug>?preview=true en un
  //    iframe SAME-ORIGIN). 'self' NO es vector de clickjacking — un atacante
  //    no puede embeber la tienda en SU dominio; solo bloquea cross-origin.
  //    (Brandon 2026-06-08: 'none' rompía el editor estilo WordPress.)
  const isDev = process.env.NODE_ENV !== "production";

  /* En dev (Next.js/Turbopack HMR): forzamos 'unsafe-inline' aunque haya nonce.
     CSP3 ignora 'unsafe-inline' cuando hay nonce, por eso lo incluimos sin
     nonce — HMR inyecta scripts inline sin nonce y los necesita aprobados.
     En prod: nonce + strict-dynamic para máxima seguridad. */
  let scriptSrc: string;
  if (isDev) {
    scriptSrc = `'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://vitals.vercel-insights.com https://us-assets.i.posthog.com`;
  } else if (nonce) {
    scriptSrc = `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' https://va.vercel-scripts.com https://vitals.vercel-insights.com https://us-assets.i.posthog.com`;
  } else {
    scriptSrc = `'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://vitals.vercel-insights.com https://us-assets.i.posthog.com`;
  }

  // SECURITY 2026-05-12 (audit defensivo P1-1): `img-src *` permitía cargar
  // imágenes desde cualquier dominio, abriendo canal de exfil si se combinaba
  // con un XSS pequeño. Restringido a https: (bloquea cleartext http MITM) +
  // self + data + blob. Supabase storage y CDNs externos siguen funcionando.
  const directives: Record<string, string> = {
    "default-src":               "'self'",
    "script-src":                scriptSrc,
    "style-src":                 "'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src":                   "'self' data: blob: https:",
    "font-src":                  "'self' data: https://fonts.gstatic.com",
    "connect-src":               "'self' data: https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://region1.google-analytics.com https://clarity.ms https://*.clarity.ms https://nominatim.openstreetmap.org https://va.vercel-scripts.com https://vitals.vercel-insights.com https://api.apis.net.pe https://eldni.com https://us.i.posthog.com https://us-assets.i.posthog.com",
    "media-src":                 "'self'",
    // frame-src: sin declararlo hereda `default-src 'self'`, que NO incluye
    // blob: — y la vista previa del drive arma un blob con el archivo para
    // poder leer el status antes de mostrarlo. Resultado: el navegador
    // bloqueaba el PDF con "Este contenido está bloqueado" (Brandon 2026-07-27).
    // blob:/data: son de la propia app: no agregan superficie externa.
    "frame-src":                 "'self' blob: data:",
    "object-src":                "'none'",
    "base-uri":                  "'self'",
    "form-action":               "'self'",
    "frame-ancestors":           isAdminRoute ? "'none'" : "'self'",
    "upgrade-insecure-requests": "",
    // SECURITY 2026-05-12 (P3-11 audit defensivo): report-uri envia violaciones
    // CSP al endpoint /api/csp-report. Útil para detectar:
    //  - XSS attempts en prod (alguien inyectó <script> bloqueado por CSP)
    //  - Tracking pixels no autorizados (img-src violations)
    //  - Configuración rota (legitimate resources bloqueados)
    // El endpoint debe rate-limitar y solo persistir reportes únicos.
    "report-uri":                "/api/csp-report",
  };

  return Object.entries(directives)
    .map(([k, v]) => (v ? `${k} ${v}` : k))
    .join("; ");
}
