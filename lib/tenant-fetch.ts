/**
 * Tenant-aware fetch wrapper for admin panel.
 *
 * Reads the active tenant slug from localStorage and injects
 * the x-tenant-id header automatically. This ensures that when
 * multiple tenant tabs are open, each one sends requests to the
 * correct tenant regardless of cookie state.
 */
export function tenantFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // sessionStorage is per-tab, localStorage is shared across tabs
  // Priority: sessionStorage (per-tab) > localStorage (fallback)
  const tenantSlug = typeof window !== "undefined"
    ? sessionStorage.getItem("active-tenant-slug")
      || localStorage.getItem("active-tenant-slug")
      || "main"
    : "main";

  const headers = new Headers(init?.headers);
  if (!headers.has("x-tenant-id")) {
    headers.set("x-tenant-id", tenantSlug);
  }

  return fetch(input, { ...init, headers });
}
