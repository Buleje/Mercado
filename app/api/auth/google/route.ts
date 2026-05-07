import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/auth/oauth-google";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";

/**
 * GET /api/auth/google
 *
 * Initiates Google OAuth 2.0 flow.
 * Sets a CSRF state cookie and redirects the user to Google's consent screen.
 *
 * Requires the "oauth_google" feature flag to be enabled for the tenant.
 * Tenant is resolved from the x-tenant-id header (injected by middleware).
 *
 * Query params:
 *   ?redirect=<ruta-interna>  — destino post-callback (p. ej. /cuenta/pedidos).
 *                               Si se omite, el callback usa /marketplace/explorar.
 */
export async function GET(req: NextRequest) {
  const tenantId =
    req.headers.get("x-tenant-id") ?? "main";

  // Verificar credenciales antes de chequear feature flag — 500 silencioso
  // por env vacías es muy frustrante. Brandon 2026-05-05.
  const credsConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
  if (!credsConfigured) {
    logger.warn("[oauth/google] Missing GOOGLE_CLIENT_ID/SECRET", { tenantId });
    return NextResponse.json(
      {
        error: "Google OAuth no configurado",
        message: "Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el .env. Configurá ambos desde Google Cloud Console (APIs & Services → Credentials) y reiniciá el servidor.",
        setupUrl: "https://console.cloud.google.com/apis/credentials",
      },
      { status: 503 }
    );
  }

  const enabled = isFeatureEnabled("oauth-google", tenantId);
  if (!enabled) {
    logger.info("[oauth/google] OAuth flag disabled for tenant", { tenantId });
    return NextResponse.json(
      { error: "Google OAuth está deshabilitado para este tenant. Activá el feature flag oauth-google." },
      { status: 404 }
    );
  }

  // Generate CSRF state token
  const state = crypto.randomUUID();
  const url = getGoogleAuthUrl(state);

  // Capturar el destino post-login — solo aceptamos rutas internas ("/*").
  // Open-redirect safe: rechazamos "//..." y URLs absolutas.
  const rawRedirect = req.nextUrl.searchParams.get("redirect") ?? "";
  const safeRedirect =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : "";

  logger.debug("[oauth/google] Redirecting to Google consent", {
    tenantId,
    hasRedirect: safeRedirect.length > 0,
  });

  const response = NextResponse.redirect(url);
  response.cookies.set("__Host-oauth-state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  // Persist tenantId so the callback can resolve it
  response.cookies.set("__Host-oauth-tenant", tenantId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  // Persist optional post-login redirect so the callback can honor it.
  if (safeRedirect.length > 0) {
    response.cookies.set("__Host-oauth-redirect", safeRedirect, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
  }

  return response;
}
