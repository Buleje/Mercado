/**
 * lib/api-version.ts
 *
 * Helpers for API versioning. See docs/api-versioning-strategy.md.
 */

import "server-only";
import { NextResponse } from "next/server";

/**
 * Matches `/api/v1/`, `/api/v2/`, ... at the start of a pathname.
 * Captures group is the version segment so callers can inspect it if needed.
 */
const API_VERSION_REGEX = /^\/api\/v(\d+)(\/|$)/;

/**
 * Normalize a pathname by stripping the version segment, so that legacy prefix
 * lists in `proxy.ts` match both versioned and unversioned paths.
 *
 * @example
 *   stripApiVersion("/api/v1/products")  // → "/api/products"
 *   stripApiVersion("/api/v2/orders/42") // → "/api/orders/42"
 *   stripApiVersion("/api/products")     // → "/api/products" (unchanged)
 */
export function stripApiVersion(pathname: string): string {
  return pathname.replace(API_VERSION_REGEX, "/api$2");
}

/**
 * Extract the version number from a pathname, or null if unversioned.
 *
 * @example
 *   getApiVersion("/api/v1/products") // → 1
 *   getApiVersion("/api/products")    // → null
 */
export function getApiVersion(pathname: string): number | null {
  const m = API_VERSION_REGEX.exec(pathname);
  if (!m) return null;
  return Number(m[1]);
}

/**
 * Wrap a legacy endpoint's response so clients see deprecation signals.
 * Adds RFC 8594 (Sunset) and RFC 8288 (Link) headers.
 *
 * @param res The upstream response from the versioned handler
 * @param successorPath The `/api/vN/...` path that replaces the legacy one
 * @param sunsetIso Optional ISO date when the legacy endpoint stops working
 */
export function deprecatedResponse(
  res: Response,
  successorPath: string,
  sunsetIso?: string
): Response {
  // Clone response so we can mutate headers without touching the original
  const body = res.body;
  const headers = new Headers(res.headers);
  headers.set("Deprecation", "true");
  headers.set("Link", `<${successorPath}>; rel="successor-version"`);
  if (sunsetIso) headers.set("Sunset", sunsetIso);
  return new NextResponse(body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
