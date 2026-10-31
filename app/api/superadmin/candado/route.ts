import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { logger } from "@/lib/logger";
import {
  CANDADO_COOKIE,
  OPCIONES_COOKIE_DESBLOQUEO,
  borrarCandado,
  configurarCandado,
  desbloqueoVigente,
  estadoCandado,
  firmarDesbloqueo,
  reautenticar,
  totpActivo,
  verificarCandado,
  type ResultadoIntento,
} from "@/lib/superadmin/candado";
import { CandadoDeleteSchema, CandadoPostSchema, duracionEnPalabras, type EstadoCandadoRespuesta } from "@/lib/superadmin/candado-reglas";

/**
 * /api/superadmin/candado — el candado personal del superadmin que protege la
 * pestaña «Credenciales» de la ficha de una tienda (y, si está configurado, toda
 * suplantación y las acciones de seguridad sobre una tienda).
 *
 *   GET    → `{ configurado, tipo, bloqueadoHasta, desbloqueadoHasta, totpActivo }`
 *   POST   `{ accion: "configurar", tipo, secreto, actual?, reauth? }`
 *            · primera vez → `reauth` (contraseña + 2FA si lo tiene)
 *            · cambio → `actual`
 *            · «Olvidé mi candado» → `reauth` sin `actual` (pisa el candado)
 *   POST   `{ accion: "verificar", secreto }` → desbloquea 5 min (cookie httpOnly)
 *   POST   `{ accion: "cerrar" }` → cierra el desbloqueo antes de que venza
 *   DELETE `{ reauth }` → borra el candado
 *
 * Sin sesión de plataforma: 401. CSRF: 403. Secreto o reautenticación errados: 422
 * (nunca 401: `fetchSuperadmin` mandaría al login). Bloqueado: 423. 5 fallos seguidos
 * bloquean 15 min, y cada bloqueo seguido dobla el anterior hasta 24 h (lo cuenta la
 * base, no la instancia). Cada bloqueo, apertura, fallo de reautenticación y borrado
 * queda en la auditoría.
 */

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function respuestaIntento(r: Exclude<ResultadoIntento, { ok: true }>): NextResponse {
  switch (r.motivo) {
    case "sin_candado":
      return NextResponse.json({ error: "sin_candado", message: "Todavía no configuraste el candado." }, { status: 409, headers: NO_STORE });
    case "requiere_actual":
      return NextResponse.json(
        { error: "requiere_actual", message: "Para cambiar el candado pon primero el actual." },
        { status: 400, headers: NO_STORE },
      );
    case "requiere_reauth":
      return NextResponse.json(
        { error: "reauth_requerida", message: "Confirma con tu contraseña de superadmin." },
        { status: 400, headers: NO_STORE },
      );
    case "invalido":
      return NextResponse.json({ error: "invalido", message: r.mensaje }, { status: 400, headers: NO_STORE });
    case "bloqueado": {
      const resta = Math.max(1, r.hasta - Date.now());
      return NextResponse.json(
        {
          error: "bloqueado",
          message: `Demasiados intentos. El candado está bloqueado ${duracionEnPalabras(resta)}. Si lo olvidaste, usa «Olvidé mi candado».`,
          bloqueadoHasta: r.hasta,
        },
        { status: 423, headers: { ...NO_STORE, "Retry-After": String(Math.ceil(resta / 1000)) } },
      );
    }
    case "incorrecto":
      return NextResponse.json(
        { error: "incorrecto", message: "No coincide.", restantes: r.restantes },
        // 422 y no 401: un PIN errado no es sesión vencida (fetchSuperadmin manda al login con 401/403).
        { status: 422, headers: NO_STORE },
      );
  }
}

/** El cuerpo JSON o `null` (cuerpo vacío o roto → lo rechaza el schema con 400). */
async function leerJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

const auditar = (accion: string, detalle: string, username: string, meta?: Record<string, unknown>) =>
  logSuperadminAction(accion, detalle, meta, username).catch((err) =>
    logger.error("[superadmin/candado] audit failed", { error: String(err), accion }),
  );

const ipDe = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 45) ?? null;

/** Audita el intento fallido y, si este intento abrió un bloqueo, el bloqueo. */
async function auditarFallo(req: NextRequest, username: string, r: Exclude<ResultadoIntento, { ok: true }>, que: string) {
  if (r.motivo === "bloqueado" && r.nuevo) {
    await auditar(
      "candado_bloqueado",
      `Candado de credenciales bloqueado ${duracionEnPalabras(r.hasta - Date.now())} (bloqueo seguido nº ${r.numero}) al ${que}`,
      username,
      { ip: ipDe(req), hasta: new Date(r.hasta).toISOString(), numero: r.numero },
    );
  } else if (r.motivo === "incorrecto") {
    await auditar("candado_fallo", `Candado de credenciales: intento fallido al ${que}`, username, { ip: ipDe(req) });
  }
}

function conCookie(body: Record<string, unknown>, token: string): NextResponse {
  const res = NextResponse.json(body, { headers: NO_STORE });
  res.cookies.set(CANDADO_COOKIE, token, OPCIONES_COOKIE_DESBLOQUEO);
  return res;
}

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const desb = await desbloqueoVigente(req, auth.username);
    const estado = desb?.estado ?? (await estadoCandado(auth.username));
    const body: EstadoCandadoRespuesta = {
      configurado: estado.configurado,
      tipo: estado.tipo,
      bloqueadoHasta: estado.bloqueadoHasta,
      desbloqueadoHasta: desb?.vence ?? null,
      totpActivo: await totpActivo(auth.username),
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (e) {
    logger.error("[superadmin/candado] GET", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const raw = (await leerJson(req.clone())) as { accion?: unknown } | null;
  // Cerrar el candado antes de que venza (borra la cookie): no gasta cupo de intentos.
  if (raw?.accion === "cerrar") {
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
    const a = await requirePlatformAPI(req);
    if (a instanceof NextResponse) return a;
    const res = NextResponse.json({ ok: true }, { headers: NO_STORE });
    res.cookies.set(CANDADO_COOKIE, "", { ...OPCIONES_COOKIE_DESBLOQUEO, maxAge: 0 });
    return res;
  }
  const prefijo = raw?.accion === "configurar" ? "sa-candado-configurar" : "sa-candado-verificar";
  // LOGIN (20/h por IP) y no AUTH (3/h): el freno real es el bloqueo propio del
  // candado (5 fallos → 15 min, por usuario); con AUTH, abrirlo 4 veces en una
  // hora dejaba al dueño afuera aunque acertara.
  const rl = applyRateLimit(req, "LOGIN", prefijo);
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = CandadoPostSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const username = auth.username;

  try {
    if (parsed.data.accion === "configurar") {
      const { tipo, secreto, actual, reauth } = parsed.data;
      // Primera vez y «Olvidé mi candado» (sin `actual`): contraseña + 2FA antes de tocar nada.
      let reautenticado = false;
      if (!actual) {
        const tope = topeDeContrasena(req);
        if (tope) return tope;
        const ra = await reautenticar(username, reauth);
        if (!ra.ok) {
          if (ra.status === 422) await auditar("candado_reauth_fallida", `Candado de credenciales: reautenticación fallida al configurarlo (${ra.error})`, username, { ip: ipDe(req) });
          return NextResponse.json({ error: ra.error, message: ra.message }, { status: ra.status, headers: NO_STORE });
        }
        reautenticado = true;
      }
      const habia = (await estadoCandado(username)).configurado;
      const r = await configurarCandado(username, tipo, secreto, { actual, reautenticado });
      if (!r.ok) {
        await auditarFallo(req, username, r, "cambiarlo");
        return respuestaIntento(r);
      }
      const accion = actual ? "cambiado" : habia ? "recuperado (contraseña + 2FA)" : "configurado";
      await auditar(habia && !actual ? "candado_recuperado" : "candado_configurado", `Candado de credenciales ${accion} (${tipo})`, username, { tipo });
      // Recién configurado = desbloqueado: quien acaba de elegirlo no tiene que repetirlo.
      const { token, vence } = await firmarDesbloqueo(username, req.headers.get("user-agent"), r.version);
      return conCookie({ ok: true, tipo, desbloqueadoHasta: vence }, token);
    }

    const r = await verificarCandado(username, parsed.data.secreto);
    if (!r.ok) {
      await auditarFallo(req, username, r, "abrirlo");
      return respuestaIntento(r);
    }
    const { token, vence } = await firmarDesbloqueo(username, req.headers.get("user-agent"), r.version);
    await auditar("candado_desbloqueo", "Candado de credenciales abierto (5 min)", username, {
      ip: ipDe(req),
      vence: new Date(vence).toISOString(),
    });
    return conCookie({ ok: true, desbloqueadoHasta: vence }, token);
  } catch (e) {
    logger.error("[superadmin/candado] POST", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * Cada vez que se prueba la contraseña del superadmin (configurar por primera
 * vez, «Olvidé mi candado», borrar) se gasta el MISMO cupo que el login
 * (`AUTH`, prefijo `superadmin:login`): una sesión robada no tiene más intentos
 * para adivinarla que la pantalla de ingreso.
 */
function topeDeContrasena(req: NextRequest): Response | null {
  return applyRateLimit(req, "AUTH", "superadmin:login");
}

export async function DELETE(req: NextRequest) {
  const rl = topeDeContrasena(req);
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const parsed = CandadoDeleteSchema.safeParse(await leerJson(req));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  try {
    const ra = await reautenticar(auth.username, parsed.data.reauth);
    if (!ra.ok) {
      await auditar("candado_borrado_fallido", `Candado de credenciales: intento de borrarlo sin reautenticar (${ra.error})`, auth.username, { ip: ipDe(req) });
      return NextResponse.json({ error: ra.error, message: ra.message }, { status: ra.status, headers: NO_STORE });
    }
    const habia = await borrarCandado(auth.username);
    if (habia) await auditar("candado_borrado", "Candado de credenciales borrado (contraseña + 2FA)", auth.username, { ip: ipDe(req) });
    const res = NextResponse.json({ ok: true, habia }, { headers: NO_STORE });
    res.cookies.set(CANDADO_COOKIE, "", { ...OPCIONES_COOKIE_DESBLOQUEO, maxAge: 0 });
    return res;
  } catch (e) {
    logger.error("[superadmin/candado] DELETE", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
