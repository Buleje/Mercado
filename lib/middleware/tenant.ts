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
 *   1. Referer header — per-request, per-tab (multi-tab safe, authoritative
 *      when the user is navigating inside `/t/{slug}/*`).
 *   2. active-tenant cookie — shared across tabs, can be stale.
 *   3. bsm-admin-sess JWT — base64 payload has the canonical `tenantId`
 *      from the admin login flow. Not verified here (that's session.ts'
 *      job at the route level) — we only peek to route correctly.
 *
 * Returns the new tenant slug, or the input `baseTenant` if no fallback
 * produced a value.
 */
export function resolveTenantMultiSource(req: NextRequest, baseTenant: string): string {
  if (baseTenant !== DEFAULT_TENANT_ID) return baseTenant;

  let tenantId = baseTenant;

  // Source 1 (HIGHEST for multi-tab safety): Referer header contains /t/[slug]/
  // When an admin at /t/luis/admin makes API calls, Referer is
  //   http://localhost:3000/t/luis/admin
  // This is per-request and per-tab, unlike cookies which are shared.
  const referer = req.headers.get("referer");
  if (referer) {
    const refTenantMatch = referer.match(/\/t\/([^/]+)\//);
    if (refTenantMatch) {
      tenantId = decodeURIComponent(refTenantMatch[1]);
    }
  }

  // Source 2: active-tenant cookie (set during login — shared across tabs,
  // can be stale if the user switched tenants in another tab).
  if (tenantId === DEFAULT_TENANT_ID) {
    const activeTenantCookie = req.cookies.get("active-tenant")?.value;
    if (activeTenantCookie && activeTenantCookie !== DEFAULT_TENANT_ID) {
      tenantId = activeTenantCookie;
    }
  }

  // Source 3: admin session token — has tenantId in the base64 payload,
  // which is the canonical Tenant.id from the login flow.
  if (tenantId === DEFAULT_TENANT_ID) {
    const sessionCookie = req.cookies.get("bsm-admin-sess")?.value;
    if (sessionCookie) {
      try {
        const dotIdx = sessionCookie.lastIndexOf(".");
        if (dotIdx > 0) {
          const encoded = sessionCookie.slice(0, dotIdx);
          const decoded = JSON.parse(
            Buffer.from(encoded, "base64").toString(),
          ) as { tenantId?: string };
          if (decoded.tenantId && decoded.tenantId !== DEFAULT_TENANT_ID) {
            tenantId = decoded.tenantId;
          }
        }
      } catch {
        /* ignore parse errors — malformed tokens stay as "main" */
      }
    }
  }

  return tenantId;
}
