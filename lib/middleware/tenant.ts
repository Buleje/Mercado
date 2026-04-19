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
 *      canonical Tenant.id (CUID), always correct for DB queries.
 *   2. active-tenant cookie — set during impersonation/login with Tenant.id (CUID).
 *   3. Referer header — extracts slug from /t/[slug]/, useful for
 *      unauthenticated storefront browsing as last resort.
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
/**
 * Multi-source tenant fallback usado cuando el host resuelve a "main".
 *
 * SECURITY NOTE (P0 #2 — PARCIALMENTE APLICADO):
 * El Source 1 (session cookie) idealmente debería verificarse con HMAC via
 * getSessionPayload() para prevenir tenant spoofing. Sin embargo, esa función
 * es async y el contrato de este módulo es síncrono (consumido directamente
 * en proxy.ts línea 53 sin await).
 *
 * El fix completo requiere:
 *   1. Hacer esta función async (ya preparada arriba con import de getSessionPayload)
 *   2. Agregar `await` en proxy.ts línea 53 (bloqueado por danger-zone hook —
 *      debe ser aplicado por security-squad via /security-squad agent)
 *
 * MITIGACIÓN ACTUAL: aunque no se verifica HMAC aquí, el tenantId extraído
 * de la cookie solo se usa para routing en el middleware. La autorización real
 * ocurre en requireAdmin() / requireCustomer() que SÍ verifican HMAC
 * (getSessionPayload) antes de ejecutar cualquier query de base de datos.
 * Un atacante que forge la cookie obtiene routing incorrecto pero NO acceso
 * a datos de otro tenant porque los API handlers tienen su propia verificación.
 *
 * TODO(security-squad P0 #2): make async + add await in proxy.ts:53
 */
export function resolveTenantMultiSource(req: NextRequest, baseTenant: string): string {
  if (baseTenant !== DEFAULT_TENANT_ID) return baseTenant;

  // Source 1 (HIGHEST): Admin session JWT — canonical tenantId (CUID).
  // SECURITY: decodifica sin verificar HMAC (limitación de contrato síncrono).
  // Ver nota arriba sobre P0 #2 y la mitigación en requireAdmin/requireCustomer.
  const sessionCookie =
    req.cookies.get("buleje-admin-sess")?.value ??
    req.cookies.get("bsm-admin-sess")?.value;
  if (sessionCookie) {
    try {
      const dotIdx = sessionCookie.lastIndexOf(".");
      if (dotIdx > 0) {
        const encoded = sessionCookie.slice(0, dotIdx);
        const decoded = JSON.parse(
          Buffer.from(encoded, "base64").toString(),
        ) as { tenantId?: string };
        if (decoded.tenantId && decoded.tenantId !== DEFAULT_TENANT_ID) {
          return decoded.tenantId;
        }
      }
    } catch {
      /* ignore parse errors — malformed tokens stay as "main" */
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
