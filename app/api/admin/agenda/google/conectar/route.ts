import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ROLES_CONECTAR_AGENDA, puedeConectarAgenda } from "@/lib/admin/agenda-acceso";
import { esSuplantacion } from "@/lib/auth/suplantacion";
import {
  COOKIE_NONCE_GOOGLE,
  RUTA_CALLBACK_GOOGLE,
  RUTA_VUELTA_PANEL,
  VIDA_STATE_MS,
  credencialesGoogle,
  firmarState,
  nuevoNonce,
  origenActual,
  urlDeConsentimiento,
} from "@/lib/agenda/google/oauth";

/**
 * GET /api/admin/agenda/google/conectar — 302 a la pantalla de permiso de Google
 * (ADR-501 §5b). El panel lo abre con una navegación normal (no fetch).
 *
 * `state` firmado con el negocio y el usuario de ESTA sesión + nonce en cookie
 * httpOnly (Lax, sólo para la ruta de vuelta, 10 min). Sin credenciales de Google,
 * vuelve al panel con `google=no_configurado` en vez de romperse.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_CONECTAR_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeConectarAgenda(auth.role)) {
    return NextResponse.json({ error: "Sólo el administrador o el dueño puede conectar Google" }, { status: 403 });
  }
  // La vista de tienda del superadmin dura minutos; una conexión de Google la sobreviviría.
  if (esSuplantacion(auth.username)) {
    return NextResponse.json({ error: "La vista de tienda no puede conectar Google (sobreviviría a la sesión)" }, { status: 403 });
  }

  const origen = (await origenActual()) ?? req.nextUrl.origin;
  const cred = credencialesGoogle();
  if (!cred) {
    return NextResponse.redirect(new URL(`${RUTA_VUELTA_PANEL}&google=no_configurado`, origen), 302);
  }

  const nonce = nuevoNonce();
  const state = firmarState({ t: auth.tenantId, u: auth.username, n: nonce, e: Date.now() + VIDA_STATE_MS });
  const destino = urlDeConsentimiento({
    clientId: cred.clientId,
    redirectUri: `${origen}${RUTA_CALLBACK_GOOGLE}`,
    state,
    nonce,
  });
  const res = NextResponse.redirect(destino, 302);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(COOKIE_NONCE_GOOGLE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: RUTA_CALLBACK_GOOGLE,
    maxAge: Math.floor(VIDA_STATE_MS / 1000),
  });
  return res;
}
