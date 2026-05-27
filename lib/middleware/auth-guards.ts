/**
 * lib/middleware/auth-guards.ts
 *
 * Path-based auth guards used by the edge middleware (proxy.ts).
 *
 * Each guard returns either:
 *   - a NextResponse (block / redirect / 401 json) → caller returns it
 *   - null → caller continues
 *
 * All guards are async because they call verifySessionToken /
 * getPlatformSession which perform HMAC verification.
 *
 * Extracted from proxy.ts on 2026-04-08 as part of the TD-013 refactor
 * (see docs/adr/014-middleware-module-split.md). Behavior is identical
 * to the inlined original; only shape changes.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION } from "@/lib/session";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import {
  ADMIN_ONLY_API_PREFIXES,
  WRITE_PROTECTED_API_PREFIXES,
  PUBLIC_WRITE_ALLOWLIST,
} from "./constants";

// ── Helper ────────────────────────────────────────────────────────────────────

function json401(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

async function hasValidAdminSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

/**
 * Endpoints under /api/admin/* that a valid platform (superadmin) session
 * is also allowed to read. Keep narrow: only platform-shaped data, never
 * tenant-mutation routes.
 */
const ADMIN_ENDPOINTS_ALLOWED_FOR_PLATFORM = ["/api/admin/health"] as const;

async function hasValidPlatformSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return false;
  const ua = req.headers.get("user-agent");
  const session = await getPlatformSession(token, { ua });
  return !!session;
}

// ── Guards ────────────────────────────────────────────────────────────────────

/**
 * Superadmin API guard — protects `/api/superadmin/*` except the auth
 * sub-tree (login/logout/probe), which manages its own rate limit and
 * credential validation.
 *
 * If the request passes, this mutates `requestHeaders` with the
 * platform username (`x-platform-user`) for downstream audit logging
 * and returns the `NextResponse.next(...)` payload.
 */
export async function guardSuperadminApi(
  req: NextRequest,
  pathname: string,
  requestHeaders: Headers,
): Promise<NextResponse | null> {
  if (!pathname.startsWith("/api/superadmin")) return null;

  // Auth sub-tree is public (handles its own rate limit + validation)
  if (pathname.startsWith("/api/superadmin/auth")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const platformToken = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!platformToken) {
    return json401("Unauthorized — platform session required");
  }

  const ua = req.headers.get("user-agent");
  const session = await getPlatformSession(platformToken, { ua });
  if (!session) {
    return json401("Unauthorized — invalid or expired token");
  }

  // Inject platform username for downstream audit logging
  requestHeaders.set("x-platform-user", session.username);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

/**
 * Superadmin pages guard — protects `/superadmin/*` except `/superadmin/login*`.
 * Verifies the HMAC signature AND expiration of the platform cookie.
 * Expired or invalid → redirect to `/superadmin/login` and clear the cookie.
 */
/**
 * Brandon 2026-05-16 (audit Info preventivo): allowlist para `?next=` en
 * redirects del superadmin guard. Hoy NO usamos `?next=` (el flow va a
 * /superadmin/dashboard hardcoded), pero si en el futuro se implementa,
 * esta función previene open-redirect via WhatsApp phishing.
 *
 * Mismo patrón que safeRedirectPath() en app/admin/login/page.tsx.
 */
 
export function safeSuperadminNext(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  let dest: string;
  try {
    dest = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (!dest.startsWith("/superadmin")) return fallback;  // solo rutas superadmin
  if (dest.startsWith("//")) return fallback;
  if (dest.includes("://")) return fallback;
  if (/^[a-z]+:/i.test(dest)) return fallback;
  if (dest.includes("\\")) return fallback;
  return dest;
}

export async function guardSuperadminPages(
  req: NextRequest,
  pathname: string,
  withTenant: { request: { headers: Headers } },
): Promise<NextResponse | null> {
  if (!pathname.startsWith("/superadmin")) return null;

  // Login sub-tree is always public
  if (pathname === "/superadmin/login" || pathname.startsWith("/superadmin/login/")) {
    return NextResponse.next(withTenant);
  }

  const platformToken = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!platformToken) {
    return NextResponse.redirect(new URL("/superadmin/login", req.url));
  }

  const ua = req.headers.get("user-agent");
  const session = await getPlatformSession(platformToken, { ua });
  if (!session) {
    // Invalid, expired, idle-timeout, or UA mismatch — clear the cookie
    // and redirect with reason. UA mismatch implica posible robo de cookie
    // (otro navegador / curl). El mensaje genérico "expired" no revela el
    // mecanismo de detección al atacante.
    const loginUrl = new URL("/superadmin/login", req.url);
    loginUrl.searchParams.set("reason", "expired");
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(PLATFORM_SESSION.COOKIE_NAME);
    return response;
  }

  return NextResponse.next(withTenant);
}

/**
 * Admin pages guard — protects all `/admin/*` routes. Missing or
 * invalid session → 302 to `/admin/login?from=<pathname>`.
 *
 * The caller already handled `/admin/login` as public before calling
 * this guard.
 */
export async function guardAdminPages(
  req: NextRequest,
  pathname: string,
): Promise<NextResponse | null> {
  if (!pathname.startsWith("/admin")) return null;

  if (await hasValidAdminSession(req)) return null;

  // Si viene del superadmin (cookie de plataforma válida) pero todavía no
  // impersonó ningún tenant, lo mandamos al listado de tenants donde un
  // clic basta para entrar al admin de cualquier negocio sin loguearse.
  if (await hasValidPlatformSession(req)) {
    const url = new URL("/superadmin/tenants", req.url);
    url.searchParams.set("reason", "pick-tenant");
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

/**
 * Admin-only API guard — every HTTP method on the prefixes in
 * ADMIN_ONLY_API_PREFIXES requires a valid admin session.
 */
/**
 * Admin API endpoints que son PÚBLICOS (sin auth).
 * Casos: error boundaries (log-error) que disparan ANTES del login,
 * health probes que necesitan responder sin sesión.
 */
const ADMIN_PUBLIC_ENDPOINTS = [
  "/api/admin/log-error",
] as const;

export async function guardAdminOnlyApi(
  req: NextRequest,
  pathname: string,
): Promise<NextResponse | null> {
  const isPublic = ADMIN_PUBLIC_ENDPOINTS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isPublic) return null;

  const isAdminOnly = ADMIN_ONLY_API_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isAdminOnly) return null;

  if (await hasValidAdminSession(req)) return null;

  // Narrow opt-in: a few admin GET endpoints are also readable with a
  // valid platform session (e.g. /api/admin/health for the superadmin
  // health dashboard). The route handler still re-checks auth.
  const isPlatformReadable = ADMIN_ENDPOINTS_ALLOWED_FOR_PLATFORM.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isPlatformReadable && req.method === "GET" && (await hasValidPlatformSession(req))) {
    return null;
  }

  return json401();
}

/**
 * Write-protected shared API guard — the prefixes in
 * WRITE_PROTECTED_API_PREFIXES allow public GET but require admin
 * auth for POST/PUT/PATCH/DELETE, with a narrow allow-list of public
 * writes (customer placing order, posting review, spinning coupon…).
 */
export async function guardWriteProtectedApi(
  req: NextRequest,
  pathname: string,
  withTenant: { request: { headers: Headers } },
): Promise<NextResponse | null> {
  const isWriteProtected = WRITE_PROTECTED_API_PREFIXES.some((p) =>
    pathname.startsWith(p),
  );
  if (!isWriteProtected) return null;
  if (req.method === "GET") return null;

  // Public allow-list for specific storefront writes
  const params = req.nextUrl.searchParams;
  const isPublicWrite = PUBLIC_WRITE_ALLOWLIST.some((rule) =>
    rule(pathname, req.method, params),
  );
  if (isPublicWrite) {
    return NextResponse.next(withTenant);
  }

  if (await hasValidAdminSession(req)) return null;
  return json401();
}
