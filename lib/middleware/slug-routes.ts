/**
 * lib/middleware/slug-routes.ts
 *
 * Handles the `/t/{slug}/*` URL scheme that rewrites slug-prefixed URLs
 * to the real app routes while injecting `x-tenant-id` header and
 * `active-tenant` cookie.
 *
 * Three cases are supported:
 *   1. `/t/{slug}/<anything-not-starting-with-admin>` → storefront rewrite
 *   2. `/t/{slug}/admin...` → admin rewrite
 *   3. `/t/{slug}` (exact landing, with or without trailing slash) →
 *      no rewrite, just inject tenant context
 *
 * Extracted from proxy.ts on 2026-04-08 as part of the TD-013 refactor
 * (see docs/adr/014-middleware-module-split.md).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applySecurityHeaders } from "./security-headers";

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

/**
 * Returns a NextResponse if the request matches one of the `/t/{slug}/*`
 * shapes, or `null` if the path is not slug-prefixed and should fall
 * through to the main proxy orchestrator.
 */
export function handleSlugRoute(
  req: NextRequest,
  pathname: string,
  nonce: string,
  requestId: string,
): NextResponse | null {
  // Case 1: /t/{slug}/<rest> where rest does NOT start with /admin
  const slugStoreMatch = pathname.match(/^\/t\/([^/]+)(\/(?!admin).+)$/);
  if (slugStoreMatch) {
    const slug = decodeURIComponent(slugStoreMatch[1]);
    const restPath = slugStoreMatch[2]; // e.g., "/tienda", "/carrito"
    return rewriteWithTenant(req, restPath, slug, nonce, requestId);
  }

  // Case 2: /t/{slug}/admin...
  const slugAdminMatch = pathname.match(/^\/t\/([^/]+)(\/admin.*)$/);
  if (slugAdminMatch) {
    const slug = decodeURIComponent(slugAdminMatch[1]);
    const adminPath = slugAdminMatch[2]; // e.g. /admin, /admin/login
    return rewriteWithTenant(req, adminPath, slug, nonce, requestId);
  }

  // Case 3: /t/{slug} (exact landing page, with or without trailing slash)
  const slugLandingMatch = pathname.match(/^\/t\/([^/]+)\/?$/);
  if (slugLandingMatch) {
    const slug = decodeURIComponent(slugLandingMatch[1]);
    return passThroughWithTenant(req, pathname, slug, nonce, requestId);
  }

  return null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildTenantHeaders(req: NextRequest, tenantId: string, nonce: string, requestId: string): Headers {
  const headers = new Headers(req.headers);
  headers.set("x-tenant-id", tenantId);
  headers.set("x-request-id", requestId);
  headers.set("x-nonce", nonce);
  // Marker leído por server components/layouts que comparten template entre el
  // marketplace (`/tienda`) y la tienda individual (`/t/<slug>/tienda`).
  // Permite ocultar branding del marketplace en la tienda del comerciante.
  headers.set("x-tenant-store-route", "1");
  return headers;
}

function setActiveTenantCookie(response: NextResponse, tenantId: string): NextResponse {
  response.cookies.set("active-tenant", tenantId, {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  return response;
}

/** URL rewrite: change the pathname, inject tenant, set cookie, apply security headers. */
function rewriteWithTenant(
  req: NextRequest,
  destPath: string,
  tenantId: string,
  nonce: string,
  requestId: string,
): NextResponse {
  const headers = buildTenantHeaders(req, tenantId, nonce, requestId);
  const rewriteUrl = new URL(destPath + req.nextUrl.search, req.url);
  const response = NextResponse.rewrite(rewriteUrl, { request: { headers } });
  setActiveTenantCookie(response, tenantId);
  return applySecurityHeaders(response, destPath, nonce, requestId);
}

/** Pass-through: keep the URL, inject tenant, set cookie, apply security headers. */
function passThroughWithTenant(
  req: NextRequest,
  pathname: string,
  tenantId: string,
  nonce: string,
  requestId: string,
): NextResponse {
  const headers = buildTenantHeaders(req, tenantId, nonce, requestId);
  const response = NextResponse.next({ request: { headers } });
  setActiveTenantCookie(response, tenantId);
  return applySecurityHeaders(response, pathname, nonce, requestId);
}
