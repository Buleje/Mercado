/**
 * Tenant-aware fetch wrapper for client-side code.
 *
 * Resolves the active tenant slug from multiple sources (in priority order):
 *  1. sessionStorage "active-tenant-slug" (per-tab override, e.g. admin switching tenants)
 *  2. URL path /t/[slug]/ prefix
 *  3. Subdomain (demo.buleje.pe → "demo")
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
const PRIMARY_DOMAINS = ["buleje.pe", "localhost", "vercel.app"];

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
 * e.g. demo.buleje.pe → "demo"
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
 * Resolve the active tenant slug and fall back to the authenticated admin
 * session when the browser storage still points to "main" or is empty.
 */
export async function resolveActiveTenantSlug(): Promise<string> {
  const current = getActiveTenantSlug();
  if (current && current !== DEFAULT_TENANT) return current;

  try {
    const authRes = await fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store",
    });
    if (!authRes.ok) return current || DEFAULT_TENANT;

    const auth = (await authRes.json()) as { tenantId?: string | null };
    if (!auth.tenantId) return current || DEFAULT_TENANT;

    const tenantRes = await fetch(
      `/api/tenants/resolve?slug=${encodeURIComponent(auth.tenantId)}`,
      {
        credentials: "include",
        cache: "no-store",
      },
    );
    if (!tenantRes.ok) return current || DEFAULT_TENANT;

    const tenant = (await tenantRes.json()) as { slug?: string | null };
    const resolved = tenant.slug?.trim();
    if (!resolved) return current || DEFAULT_TENANT;

    try {
      sessionStorage.setItem("active-tenant-slug", resolved);
    } catch {}
    try {
      localStorage.setItem("active-tenant-slug", resolved);
    } catch {}

    return resolved;
  } catch {
    return current || DEFAULT_TENANT;
  }
}

/** HTTP methods that need CSRF token */
const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Read the csrf-token cookie value (set by middleware on every response).
 */
function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Tenant-aware fetch. Drop-in replacement for window.fetch() that
 * automatically injects x-tenant-id and X-CSRF-Token headers.
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

  // Auto-inject CSRF token for mutation methods
  const method = (init?.method ?? "GET").toUpperCase();
  if (CSRF_METHODS.has(method) && !headers.has("x-csrf-token")) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set("x-csrf-token", csrfToken);
    }
  }

  return fetch(input, { ...init, headers });
}
