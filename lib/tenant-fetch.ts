/**
 * Tenant-aware fetch wrapper for client-side code.
 *
 * Resolves the active tenant slug from multiple sources (in priority order):
 *  1. sessionStorage "active-tenant-slug" (per-tab override, e.g. admin switching tenants)
 *  2. URL path /t/[slug]/ prefix
 *  3. Subdomain (demo.buleje.com → "demo")
 *  4. localStorage "active-tenant-slug" (cross-tab fallback)
 *  5. Default: "main"
 *
 * Injects x-tenant-id header automatically so API routes always know
 * which tenant the request belongs to.
 */

const DEFAULT_TENANT = "main";

/** Subdomains that are NOT tenant slugs. */
const IGNORED_SUBDOMAINS = new Set(["www", "api", "mail", "ftp"]);

/** Primary domains — subdomain detection is relative to these. */
const PRIMARY_DOMAINS = ["buleje.com", "localhost", "vercel.app"];

/**
 * Extract tenant slug from the current window.location.pathname.
 * Matches /t/[slug]/ prefix.
 */
function getTenantFromPath(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/^\/t\/([a-zA-Z0-9_-]+)(\/|$)/);
  return match ? match[1] : null;
}

/**
 * Extract tenant slug from the current hostname (subdomain-based).
 * e.g. demo.buleje.com → "demo"
 */
function getTenantFromSubdomain(): string | null {
  if (typeof window === "undefined") return null;
  const hostname = window.location.hostname.toLowerCase();

  for (const primary of PRIMARY_DOMAINS) {
    if (hostname === primary || hostname === `www.${primary}`) {
      return null;
    }
    if (hostname.endsWith(`.${primary}`)) {
      const subdomain = hostname.slice(0, -(primary.length + 1)).split(".")[0];
      if (IGNORED_SUBDOMAINS.has(subdomain)) return null;
      return subdomain;
    }
  }

  return null;
}

/**
 * Resolve the current tenant slug from all available sources.
 * Exported for use outside of fetch (e.g. WebSocket connections).
 */
export function getActiveTenantSlug(): string {
  if (typeof window === "undefined") return DEFAULT_TENANT;

  // 1. Per-tab override (admin switching between tenants)
  const sessionSlug = sessionStorage.getItem("active-tenant-slug");
  if (sessionSlug) return sessionSlug;

  // 2. URL path /t/[slug]/
  const pathSlug = getTenantFromPath();
  if (pathSlug) return pathSlug;

  // 3. Subdomain
  const subdomainSlug = getTenantFromSubdomain();
  if (subdomainSlug) return subdomainSlug;

  // 4. Cross-tab fallback
  const localSlug = localStorage.getItem("active-tenant-slug");
  if (localSlug) return localSlug;

  // 5. Default
  return DEFAULT_TENANT;
}

/**
 * Tenant-aware fetch. Drop-in replacement for window.fetch() that
 * automatically injects x-tenant-id header.
 */
export function tenantFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const tenantSlug = getActiveTenantSlug();

  const headers = new Headers(init?.headers);
  if (!headers.has("x-tenant-id")) {
    headers.set("x-tenant-id", tenantSlug);
  }

  return fetch(input, { ...init, headers });
}
