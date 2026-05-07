/**
 * lib/middleware/tenant.ts
 *
 * Pure tenant-resolution logic for the edge middleware (proxy.ts).
 *
 * Two responsibilities:
 *   1. resolveTenantFromHost(req) — reads the Host header and returns a slug
 *   2. resolveTenantMultiSource(req, baseTenant) — when the host gives "main",
 *      fall through to Referer → active-tenant cookie → JWT payload
 *
 * Extracted from proxy.ts on 2026-04-08 as part of the TD-013 refactor
 * (see docs/adr/014-middleware-module-split.md). No behavior change —
 * unit-testable in isolation without spinning up the Edge runtime.
 *
 * SECURITY: never trust client-sent `x-tenant-id` — that header is
 * audited separately in proxy.ts, never consumed for routing.
 */

import type { NextRequest } from "next/server";
import {
  ROOT_DOMAIN,
  CUSTOM_DOMAIN_PREFIX,
  DEFAULT_TENANT_ID,
} from "./constants";
import { getSessionPayload } from "@/lib/session";

/**
 * Resolve a tenant slug from the incoming Host header.
 *
 * Priority:
 *   1. `slug.localhost:3000` (local dev — Chrome 74+ and Firefox 84+
 *      resolve `*.localhost` to 127.0.0.1 out of the box)
 *   2. `slug.{ROOT_DOMAIN}` (production subdomain)
 *   3. Fully custom host → `custom--{host}` synthetic slug
 *   4. localhost / 127.0.0.1 / *.vercel.app / *.trycloudflare.com → "main"
 *      (falls through to the multi-source resolver)
 */
export function resolveTenantFromHost(req: NextRequest): string {
  const host = req.headers.get("host") ?? "";
  const hostname = host.split(":")[0];

  const isVercelHost = hostname === "vercel.app" || hostname.endsWith(".vercel.app");
  // Cloudflare tunnel URLs (trycloudflare.com) are dev proxies — resolve to
  // "main" so the middleware falls through to the admin session JWT for
  // tenant resolution.
  const isCloudflareProxy = hostname.endsWith(".trycloudflare.com");

  if (hostname.endsWith(".localhost")) {
    const slug = hostname.replace(/\.localhost$/, "");
    if (slug && slug !== "www") return slug;
    return DEFAULT_TENANT_ID;
  }
  if (hostname === "localhost" || hostname === "127.0.0.1") return DEFAULT_TENANT_ID;
  if (isVercelHost) return DEFAULT_TENANT_ID;
  if (isCloudflareProxy) return DEFAULT_TENANT_ID;

  if (hostname.endsWith(`.${ROOT_DOMAIN}`) && hostname !== `www.${ROOT_DOMAIN}`) {
    const parts = hostname.split(".");
    if (parts.length >= 3) return parts[0];
  }

  if (hostname !== ROOT_DOMAIN && hostname !== `www.${ROOT_DOMAIN}`) {
    return `${CUSTOM_DOMAIN_PREFIX}${hostname}`;
  }

  return DEFAULT_TENANT_ID;
}

/**
 * Multi-source tenant fallback used when the host resolves to "main".
 *
 * Priority (highest wins):
 *   1. Admin session JWT (`buleje-admin-sess`/legacy `bsm-admin-sess`) —
 *      canonical Tenant.id (CUID). HMAC-verified via getSessionPayload()
 *      before extracting tenantId (P0 #2 fix — forged cookies are rejected).
 *   2. active-tenant cookie — set during login/impersonation with Tenant.id.
 *   3. Referer header — extracts slug from /t/[slug]/, last resort for
 *      unauthenticated storefront browsing.
 *
 * WHY JWT is highest: The Referer header extracts a *slug* (e.g. "demo"),
 * but DB records use the canonical Tenant.id (CUID). If Referer wins,
 * requireAdmin() passes the slug to DB queries → 0 results. The JWT
 * always contains the CUID from login/impersonation, so it's the safest
 * source for authenticated admin API calls.
 *
 * Returns the resolved tenant ID, or the input `baseTenant` if no fallback
 * produced a value.
 */
export async function resolveTenantMultiSource(req: NextRequest, baseTenant: string): Promise<string> {
  if (baseTenant !== DEFAULT_TENANT_ID) return baseTenant;

  // ── Source 0 (TOP PRIORITY 2026-05-06): URL path `/t/[slug]/...` ─────
  // Si el usuario está navegando explícitamente a un tenant via path, ese
  // slug es la VERDAD. Bloquea el bug donde un admin con JWT.tenantId="main"
  // navega a /t/mi-pollo/admin y el JWT pisa el path → datos de "main"
  // mezclados con UI de "mi-pollo". Esto es la guarda de aislamiento más
  // fuerte porque no se puede falsificar (la URL es explícita del usuario).
  const pathname = req.nextUrl.pathname;
  const pathTenantMatch = pathname.match(/^\/t\/([^/]+)(\/|$)/);
  if (pathTenantMatch) {
    return decodeURIComponent(pathTenantMatch[1]);
  }

  // Source 1: Admin session JWT — canonical tenantId (CUID).
  // SECURITY FIX (P0 #2): verifica HMAC via getSessionPayload() antes de
  // extraer tenantId. Tokens con firma inválida o expirados son ignorados
  // y el resolver cae al siguiente origen (Source 2 → Source 3).
  const sessionCookie =
    req.cookies.get("buleje-admin-sess")?.value ??
    req.cookies.get("bsm-admin-sess")?.value;
  if (sessionCookie) {
    const payload = await getSessionPayload(sessionCookie);
    if (payload?.tenantId && payload.tenantId !== DEFAULT_TENANT_ID) {
      return payload.tenantId;
    }
  }

  // Source 2: active-tenant cookie (set during login/impersonation with
  // canonical Tenant.id — CUID, not slug).
  const activeTenantCookie = req.cookies.get("active-tenant")?.value;
  if (activeTenantCookie && activeTenantCookie !== DEFAULT_TENANT_ID) {
    return activeTenantCookie;
  }

  // Source 3 (LOWEST): Referer header contains /t/[slug]/.
  // Extracts the slug (NOT a CUID). Only useful for unauthenticated
  // storefront browsing when no JWT or cookie is available.
  const referer = req.headers.get("referer");
  if (referer) {
    const refTenantMatch = referer.match(/\/t\/([^/]+)\//);
    if (refTenantMatch) {
      return decodeURIComponent(refTenantMatch[1]);
    }
  }

  return baseTenant;
}
