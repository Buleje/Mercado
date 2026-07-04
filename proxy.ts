/**
 * proxy.ts — Next.js 16 Routing Middleware (Vercel rebrand of middleware.ts)
 *
 * Thin orchestrator that composes focused modules from `lib/middleware/*`.
 * Each pipeline step returns either:
 *   - a NextResponse (→ return immediately), or
 *   - null (→ continue to the next step)
 *
 * Modules (TD-013 refactor, 2026-04-08 — see docs/adr/014-middleware-module-split.md):
 *   - lib/middleware/constants.ts         → ROOT_DOMAIN, prefix arrays, allow-list
 *   - lib/middleware/tenant.ts            → resolveTenantFromHost / resolveTenantMultiSource
 *   - lib/middleware/security-headers.ts  → applySecurityHeaders (CSP + OWASP bundle)
 *   - lib/middleware/slug-routes.ts       → /t/{slug}/* rewrites
 *   - lib/middleware/auth-guards.ts       → /admin, /api/admin, /superadmin, write-protected
 *   - lib/middleware/cross-tenant-audit.ts → injection-attempt logger
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { generateRequestId, generateNonce, checkRateLimit } from "@/lib/middleware-utils";
import { ensureCsrfCookie, validateCsrfToken, csrfForbiddenResponse } from "@/lib/csrf";
import {
  resolveTenantFromHost,
  resolveTenantMultiSource,
} from "@/lib/middleware/tenant";
import { applySecurityHeaders } from "@/lib/middleware/security-headers";
import { handleSlugRoute } from "@/lib/middleware/slug-routes";
import {
  guardSuperadminApi,
  guardSuperadminPages,
  guardAdminPages,
  guardAdminOnlyApi,
  guardWriteProtectedApi,
} from "@/lib/middleware/auth-guards";
import { auditCrossTenantHeader } from "@/lib/middleware/cross-tenant-audit";
import { guardThreats } from "@/lib/middleware/threat-detection";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Correlation IDs ─────────────────────────────────────────────────────────
  const requestId = request.headers.get("x-request-id") ?? generateRequestId();
  const nonce = generateNonce();

  // ── 1. Slug-based tenant routing: /t/[slug]/* ──────────────────────────────
  const slugResponse = handleSlugRoute(request, pathname, nonce, requestId);
  if (slugResponse) return slugResponse;

  // ── 2. Tenant resolution ───────────────────────────────────────────────────
  // SECURITY: never trust client-sent x-tenant-id for routing.
  // We capture it only to audit potential injection attempts below.
  const clientSentTenantHeader = request.headers.get("x-tenant-id");
  const hostTenant = resolveTenantFromHost(request);
  const tenantId = await resolveTenantMultiSource(request, hostTenant);

  // Fire-and-forget injection-attempt audit (only if header mismatch on /api/*)
  auditCrossTenantHeader(request, pathname, clientSentTenantHeader, tenantId, requestId);

  // ── 3. Build the headers bundle we'll pass downstream ──────────────────────
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-id", tenantId);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-next-pathname", pathname);
  const withTenant = { request: { headers: requestHeaders } };

  // ── 4. Rate limit all /api/* in non-dev ────────────────────────────────────
  // Distributed via Upstash Redis REST (ADR-022, 2026-04-09). Edge-compatible.
  // Must run BEFORE Bearer pass-through so external API keys are still rate-limited.
  if (pathname.startsWith("/api/") && process.env.NODE_ENV !== "development") {
    const rlResponse = await checkRateLimit(request);
    if (rlResponse) return rlResponse;
  }

  // ── 4a. WAF: detección de ataques + blocklist de IPs ───────────────────────
  // Firmas SQLi/XSS/traversal/scanner en path+query+UA → bloqueo inline (403)
  // de firmas críticas + reporte fire-and-forget (auto-ban de reincidentes).
  // Fail-open: cualquier fallo deja pasar la request. Ver lib/middleware/threat-detection.
  const threatResponse = await guardThreats(request, pathname, tenantId, requestId);
  if (threatResponse) return threatResponse;

  // ── 4b. CSRF double-submit cookie validation on mutations ─────────────────
  // Validates X-CSRF-Token header matches csrf-token cookie for POST/PATCH/PUT/DELETE.
  // Skips API-key auth, webhooks, cron, and health endpoints (see lib/csrf.ts).
  // Must run BEFORE Bearer pass-through so mutation endpoints stay protected.
  if (!validateCsrfToken(request)) {
    return csrfForbiddenResponse();
  }

  // ── 5. API key Bearer auth pass-through ────────────────────────────────────
  // Bearer sk_... on /api/* bypasses cookie-based auth entirely so route
  // handlers can call validateApiKey() from lib/api-keys.ts themselves.
  // Placed AFTER rate limit + CSRF so both protections always apply (ADR-014).
  const bearerAuth = request.headers.get("authorization") ?? "";
  if (bearerAuth.startsWith("Bearer sk_") && pathname.startsWith("/api/")) {
    requestHeaders.set("x-api-key", bearerAuth.slice("Bearer ".length));
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ── 6. Always-public routes (short-circuit) ────────────────────────────────
  if (pathname === "/admin/login") return NextResponse.next(withTenant);
  if (pathname.startsWith("/pedido/")) return NextResponse.next(withTenant);

  // ── 7. Superadmin API guard ────────────────────────────────────────────────
  const superadminApi = await guardSuperadminApi(request, pathname, requestHeaders);
  if (superadminApi) return superadminApi;

  // ── 8. Superadmin pages guard ──────────────────────────────────────────────
  const superadminPages = await guardSuperadminPages(request, pathname, withTenant);
  if (superadminPages) return superadminPages;

  // ── 9. Admin pages guard (/admin/*) ────────────────────────────────────────
  const adminPages = await guardAdminPages(request, pathname);
  if (adminPages) return adminPages;

  // ── 10. Admin-only API guard (all methods) ────────────────────────────────
  const adminOnlyApi = await guardAdminOnlyApi(request, pathname);
  if (adminOnlyApi) return adminOnlyApi;

  // ── 11. Write-protected shared API guard (POST/PUT/PATCH/DELETE) ──────────
  const writeProtected = await guardWriteProtectedApi(request, pathname, withTenant);
  if (writeProtected) return writeProtected;

  // ── 12. Default response with tenant + security headers ───────────────────
  const response = NextResponse.next(withTenant);
  // Ensure CSRF cookie is set on every response
  ensureCsrfCookie(request, response);
  return applySecurityHeaders(response, pathname, nonce, requestId);
}

export const config = {
  matcher: [
    /*
     * Match all paths except Next.js internals, static files, and platform
     * metadata endpoints that don't need tenant resolution or auth guards.
     *
     * Excluidos (antes se ejecutaba el pipeline completo sin necesidad):
     *  - _next/static, _next/image           — assets generados por Next
     *  - favicon.ico, robots.txt, sitemap.xml, manifest.webmanifest, sw.js
     *  - og-image, opengraph-image*, twitter-image*  — metadata Next.js 16
     *  - llms.txt, llms-full.txt              — AI answer engines
     *  - assets por extensión (svg/png/jpg/jpeg/gif/webp/avif/ico/woff/woff2/js/css/map)
     *
     * Efecto: -20-40% de invocaciones de Routing Middleware sin cambios
     * de comportamiento en rutas reales.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap(?:\\.xml|-.*\\.xml)|manifest\\.webmanifest|sw\\.js|llms(?:-full)?\\.txt|og-image|opengraph-image.*|twitter-image.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|js|css|map)$).*)",
  ],
};
