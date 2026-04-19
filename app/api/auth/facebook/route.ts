import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getFacebookAuthUrl } from "@/lib/auth/oauth-facebook";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";

/**
 * GET /api/auth/facebook
 *
 * Initiates Facebook OAuth 2.0 flow.
 * Sets a CSRF state cookie and redirects the user to Facebook's consent screen.
 *
 * Requires the "oauth-facebook" feature flag to be enabled for the tenant.
 * Tenant is resolved from the x-tenant-id header (injected by middleware).
 *
 * Query params:
 *   ?redirect=<ruta-interna>  — destino post-callback (p. ej. /cuenta/pedidos).
 *                               Si se omite, el callback usa /marketplace/explorar.
 */
export async function GET(req: NextRequest) {
  const tenantId =
    req.headers.get("x-tenant-id") ?? "main";

  const enabled = isFeatureEnabled("oauth-facebook", tenantId);
  if (!enabled) {
    logger.info("[oauth/facebook] OAuth not enabled for tenant", { tenantId });
    return NextResponse.json(
      { error: "Facebook OAuth not enabled for this tenant" },
      { status: 404 }
    );
  }

  // Generate CSRF state token
  const state = crypto.randomUUID();
  const url = getFacebookAuthUrl(state);

  // Capturar el destino post-login — solo aceptamos rutas internas ("/*").
  // Open-redirect safe: rechazamos "//..." y URLs absolutas.
  const rawRedirect = req.nextUrl.searchParams.get("redirect") ?? "";
  const safeRedirect =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : "";

  logger.debug("[oauth/facebook] Redirecting to Facebook consent", {
    tenantId,
    hasRedirect: safeRedirect.length > 0,
  });

  const response = NextResponse.redirect(url);
  response.cookies.set("oauth-state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  // Persist tenantId so the callback can resolve it
  response.cookies.set("oauth-tenant", tenantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  // Persist optional post-login redirect so the callback can honor it.
  if (safeRedirect.length > 0) {
    response.cookies.set("oauth-redirect", safeRedirect, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
  }

  return response;
}
