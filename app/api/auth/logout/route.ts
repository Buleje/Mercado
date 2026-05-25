import { NextRequest, NextResponse } from "next/server";
import { SESSION, REFRESH, getSessionPayload } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { cacheStore } from "@/lib/cache";
import { logger } from "@/lib/logger";

// TTL del access token en segundos (15 min) — la blacklist expira junto con el token.
const ACCESS_TTL_SEC = 15 * 60;

export async function POST(req: NextRequest) {
  try {
    const _rl = await applyRateLimit(req, "STRICT", "auth-logout"); if (_rl) return _rl;

    // SECURITY 2026-05-07 (pentest F1): revocar el access token por jti para
    // invalidar inmediatamente tokens en vuelo aunque tengan firma válida.
    const accessToken = req.cookies.get(SESSION.COOKIE_NAME)?.value;
    if (accessToken) {
      const payload = await getSessionPayload(accessToken);
      if (payload?.jti) {
        cacheStore.set(`revoked-access:${payload.jti}`, true, ACCESS_TTL_SEC);
      }
    }

    const response = NextResponse.json({ ok: true });
    // CRITICAL FIX 2026-05-11 (audit P1-13): logout limpia TODAS las cookies
    // de sesión + tenant + CSRF + OAuth. Antes solo SESSION/REFRESH se
    // limpiaban → active-tenant, customer-token, csrf-token persistían y
    // un siguiente login en otro tenant heredaba estado.
    const clearOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      maxAge: 0,
      path: "/",
    };
    const clearOptsClient = {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 0,
      path: "/",
    };
    // Auth tokens
    response.cookies.set(SESSION.COOKIE_NAME, "", clearOpts);
    response.cookies.set(REFRESH.COOKIE_NAME, "", clearOpts);
    // Tenant scoping cookies (visibles al cliente — sameSite lax)
    response.cookies.set("active-tenant", "", clearOptsClient);
    response.cookies.set("active-tenant-slug", "", clearOptsClient);
    // Customer storefront session (si existía un cliente logueado)
    response.cookies.set("customer-token", "", clearOpts);
    response.cookies.set("buleje-customer-session", "", clearOpts);
    // CSRF double-submit token
    response.cookies.set("csrf-token", "", clearOpts);
    // OAuth state (si quedó algún flujo a medias)
    response.cookies.set("__Host-oauth-state", "", { ...clearOpts, secure: true });
    response.cookies.set("__Host-oauth-pkce", "", { ...clearOpts, secure: true });
    // Pending TOTP (si se cerró sesión durante el step-up)
    response.cookies.set("pending-totp", "", clearOpts);
    return response;

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
