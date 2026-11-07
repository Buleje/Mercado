import { NextRequest, NextResponse, after } from "next/server";
import { logger } from "@/lib/logger";
import { cifrarSecreto } from "@/lib/cripto-secretos";
import { createDistributedRateLimiter, getClientIp } from "@/lib/rate-limit";
import { getSessionPayload, SESSION } from "@/lib/session";
import { AgendaConexionesDB } from "@/lib/db/agenda-conexiones.db";
import {
  COOKIE_NONCE_GOOGLE,
  ErrorGoogle,
  RUTA_CALLBACK_GOOGLE,
  RUTA_VUELTA_PANEL,
  SCOPE_CALENDARIO,
  SCOPE_TAREAS,
  canjearCodigo,
  credencialesGoogle,
  leerState,
  mismoNonce,
  origenActual,
  recordarTokenDeAcceso,
  verificadorPkce,
} from "@/lib/agenda/google/oauth";
import { asegurarCalendario } from "@/lib/agenda/google/calendar";
import { asegurarLista } from "@/lib/agenda/google/tasks";
import { sincronizarTenant } from "@/lib/agenda/google/sync";

/**
 * GET /api/public/agenda-google/callback — la vuelta desde Google (ADR-501 §5b).
 *
 * Por qué bajo `/api/public/` y no `/api/admin/…` como decía el contrato: la cookie
 * del panel es SameSite=Strict, así que NO viaja en la navegación que viene de
 * accounts.google.com, y el proxy responde 401 a todo `/api/admin/*` sin ella.
 *
 * Sin sesión, el negocio y el usuario salen SÓLO del `state` firmado (HMAC con
 * AUTH_SECRET, 10 min) que armó `conectar` con la sesión verificada, y su nonce
 * tiene que ser el de la cookie httpOnly que dejó `conectar` en este navegador. Si
 * por algún motivo SÍ llega la sesión, tiene que ser la misma del state.
 *
 * Termina con una página mínima que navega al panel: un 302 directo seguiría siendo
 * «desde Google» y la cookie Strict tampoco viajaría → pantalla de login.
 */

const limite = createDistributedRateLimiter({ key: "agenda-google-callback", maxRequests: 20, windowMs: 15 * 60_000 });

type Fin = "conectado" | "cancelado" | "error" | "no_configurado" | "sin_calendario" | "vencido";

const TITULO: Record<Fin, string> = {
  conectado: "Google conectado",
  cancelado: "Conexión cancelada",
  error: "No se pudo conectar Google",
  no_configurado: "Google no está configurado",
  sin_calendario: "Falta el permiso del calendario",
  vencido: "El enlace venció",
};

function terminar(fin: Fin, status = 200): NextResponse {
  const destino = `${RUTA_VUELTA_PANEL}&google=${fin}`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${destino.replace(/&/g, "&amp;")}"><title>${TITULO[fin]}</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem"><p>${TITULO[fin]}. Volviendo al panel…</p>
<p><a href="${destino.replace(/&/g, "&amp;")}">Volver al panel</a></p></body></html>`;
  const res = new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
  res.cookies.set(COOKIE_NONCE_GOOGLE, "", { path: RUTA_CALLBACK_GOOGLE, maxAge: 0, httpOnly: true, sameSite: "lax" });
  return res;
}

export async function GET(req: NextRequest) {
  if (!(await limite.check(getClientIp(req)))) return terminar("error", 429);

  const cred = credencialesGoogle();
  if (!cred) return terminar("no_configurado");

  const sp = req.nextUrl.searchParams;
  const state = sp.get("state") ?? "";
  const datos = leerState(state);
  if (!datos) return terminar(state ? "vencido" : "error", 400);
  if (!mismoNonce(datos.n, req.cookies.get(COOKIE_NONCE_GOOGLE)?.value)) return terminar("error", 400);

  const sesion = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  if (sesion) {
    const p = await getSessionPayload(sesion);
    if (p && (p.tenantId !== datos.t || p.username !== datos.u)) return terminar("error", 400);
  }

  const errorGoogle = sp.get("error");
  if (errorGoogle) return terminar(errorGoogle === "access_denied" ? "cancelado" : "error");
  const code = sp.get("code");
  if (!code) return terminar("error", 400);

  const origen = (await origenActual()) ?? req.nextUrl.origin;
  try {
    const tokens = await canjearCodigo(cred, code, `${origen}${RUTA_CALLBACK_GOOGLE}`, verificadorPkce(datos.n));
    // Consentimiento granular: puede destildar el calendario. Sin él no hay nada que hacer.
    if (!tokens.scopes.includes(SCOPE_CALENDARIO)) return terminar("sin_calendario");

    const previa = await AgendaConexionesDB.conexionGoogle(datos.t, datos.u);
    const mismaCuenta = previa?.email === tokens.email;
    const calendarId = await asegurarCalendario(tokens.accessToken, mismaCuenta ? (previa?.calendarId ?? null) : null);
    const tasklistId = tokens.scopes.includes(SCOPE_TAREAS)
      ? await asegurarLista(tokens.accessToken, mismaCuenta ? (previa?.tasklistId ?? null) : null).catch((err: unknown) => {
          logger.warn("[agenda/google] no se pudo crear la lista de tareas", { tenantId: datos.t, error: String(err) });
          return null;
        })
      : null;

    const fila = await AgendaConexionesDB.guardarConexionGoogle(datos.t, datos.u, {
      email: tokens.email,
      scopes: tokens.scopes,
      refreshTokenCifrado: cifrarSecreto(tokens.refreshToken),
      calendarId,
      tasklistId,
    });
    recordarTokenDeAcceso(fila.id, tokens.accessToken, tokens.expiraEnSeg);

    // Primera carga: corta (actividades con canal Google + tareas/notas de la ventana).
    after(() =>
      sincronizarTenant(datos.t, { adminUserId: datos.u, origen })
        .then((r) => logger.info("[agenda/google] primera sincronización", { tenantId: datos.t, ...r }))
        .catch((err: unknown) => logger.error("[agenda/google] primera sincronización falló", { tenantId: datos.t, error: String(err) })),
    );
    return terminar("conectado");
  } catch (e) {
    logger.warn("[agenda/google] callback falló", {
      tenantId: datos.t,
      razon: e instanceof ErrorGoogle ? e.razon : "otro",
      error: e instanceof Error ? e.message : String(e),
    });
    return terminar("error");
  }
}
