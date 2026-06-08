/**
 * lib/middleware/security-headers.ts
 *
 * Applies the standard security header bundle (CSP + nonce + OWASP bare
 * minimum) to a NextResponse. Extracted from proxy.ts on 2026-04-08 as
 * part of the TD-013 refactor (see docs/adr/014-middleware-module-split.md).
 *
 * `buildCSP` itself still lives in lib/middleware-utils.ts because it is
 * also consumed by route handlers and tests — this file only wraps the
 * response-mutation side so proxy.ts doesn't have to reason about
 * headers itself.
 */

import { NextResponse } from "next/server";
import { buildCSP } from "@/lib/middleware-utils";

/**
 * Mutate the given NextResponse with the standard security headers
 * and return it. API responses get only `x-request-id`; HTML responses
 * get the full CSP + OWASP bundle.
 *
 * @param response the response that will be returned from the middleware
 * @param pathname current pathname (used to skip CSP on /api/* routes)
 * @param nonce CSP nonce that the page and scripts will also use
 * @param requestId correlation id for logs / Sentry
 */
export function applySecurityHeaders(
  response: NextResponse,
  pathname: string,
  nonce: string,
  requestId: string,
): NextResponse {
  response.headers.set("x-request-id", requestId);

  // API responses never render HTML, so the CSP + frame/content bundle
  // would be dead weight on every single API call.
  if (pathname.startsWith("/api/")) {
    return response;
  }

  response.headers.set("Content-Security-Policy", buildCSP(pathname, nonce));
  response.headers.set("X-Content-Type-Options", "nosniff");
  // X-Frame-Options se alinea con CSP `frame-ancestors` (buildCSP): admin nunca
  // embebible (DENY); el resto SAMEORIGIN para habilitar el preview en vivo del
  // editor (iframe same-origin del storefront). Algunos browsers aplican XFO
  // aunque haya frame-ancestors, así que deben coincidir.
  const isAdminRoute =
    pathname.startsWith("/admin") || pathname.startsWith("/superadmin");
  response.headers.set("X-Frame-Options", isAdminRoute ? "DENY" : "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // geolocation=(self) habilita el botón "Usar mi ubicación" en
  // /marketplace/registrar — solo same-origin, los iframes externos no
  // heredan permiso. camera/microphone siguen bloqueados.
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)",
  );

  return response;
}
