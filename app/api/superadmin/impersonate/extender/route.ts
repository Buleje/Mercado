import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { createSessionToken, getSessionPayload, vencimientoDeSesion, SESSION } from "@/lib/session";
import {
  MINIMO_EXTENSION_MS,
  MINUTOS_EXTENDER,
  MINUTOS_SUPLANTACION_MAX,
  VIDA_MAXIMA_SUPLANTACION_S,
  superadminDeSuplantacion,
  venceExtendido,
} from "@/lib/auth/suplantacion";
import { isSessionRevoked } from "@/lib/auth/session-revocation";
import { cacheStore } from "@/lib/cache";
import { TenantsDB } from "@/lib/db/tenants.db";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { respuestaSiCandadoCerrado } from "@/lib/superadmin/candado";

/** Ni un proxy ni el navegador guardan una respuesta que trae una sesión. */
const SIN_CACHE = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

function error(status: number, codigo: string, message: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ error: codigo, message, ...extra }, { status, headers: SIN_CACHE });
}

/**
 * POST /api/superadmin/impersonate/extender — «+15 min» desde la franja del panel
 * (18-10, pedido de Brandon: «te quedan 2 min, tocas "+15" y sigues»).
 *
 * Lo pide la pestaña de la vista de tienda, con las dos sesiones del mismo
 * navegador: la de plataforma (quién es el superadmin) y la de la vista (qué
 * tienda y hasta cuándo). Exige, en orden:
 *   - límite STRICT propio (no comparte balde con entrar) y CSRF → 429 / 403;
 *   - sesión de superadmin válida en este navegador (UA atado) → si no, 401;
 *   - una vista viva: firmada, sin vencer, sin anular («Salir», logout, corte) → 401;
 *   - que la vista sea de ESTE superadmin (no la sesión real de la tienda ni la
 *     vista de otro) → 403;
 *   - el candado abierto si está configurado → 423, como al entrar;
 *   - que sumar agregue al menos 1 min: el vence nuevo es
 *     min(vence + 15 min, ahora + 60 min), nunca más de 60 por delante → 422.
 * Auditoría AWAITED (`impersonate_extend`, con los minutos y el vence nuevo)
 * antes de emitir; después, token nuevo de la misma tienda, sus 3 cookies con la
 * vida nueva y el jti viejo anulado (una copia del token anterior ya no entra).
 */
export async function POST(req: NextRequest) {
  const limitado = applyRateLimit(req, "STRICT", "superadmin-impersonate-extender");
  if (limitado) return limitado;

  if (!validateSuperadminCsrf(req)) {
    logger.warn("[superadmin/impersonate/extender] CSRF token inválido", {
      ip: req.headers.get("x-forwarded-for") ?? null,
    });
    return csrfForbiddenResponse();
  }

  const tokenPlataforma = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  const plataforma = tokenPlataforma
    ? await getPlatformSession(tokenPlataforma, { ua: req.headers.get("user-agent") })
    : null;
  if (!plataforma) {
    return error(401, "sin_sesion_superadmin", "Tu sesión de superadmin terminó: entra de nuevo al superadmin para alargar la vista.");
  }

  const tokenVista = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  const vista = tokenVista ? await getSessionPayload(tokenVista) : null;
  const venceActual = tokenVista && vista ? await vencimientoDeSesion(tokenVista) : null;
  if (!vista || venceActual === null) {
    return error(401, "sin_vista", "Esta vista de tienda ya terminó.");
  }
  const anulada =
    (!!vista.jti && !!cacheStore.get(`revoked-access:${vista.jti}`)) ||
    isSessionRevoked(vista.jti, vista.tenantId, vista.username);
  if (anulada) {
    return error(401, "vista_cerrada", "Esta vista de tienda ya se cerró.");
  }
  if (superadminDeSuplantacion(vista.username) !== plataforma.username) {
    logger.warn("[superadmin/impersonate/extender] la sesión no es una vista de este superadmin", {
      superadmin: plataforma.username,
      tenantId: vista.tenantId,
    });
    return error(403, "no_es_tu_vista", "Esta sesión no es una vista de tienda tuya.");
  }

  const candadoCerrado = await respuestaSiCandadoCerrado(req, plataforma.username);
  if (candadoCerrado) return candadoCerrado;

  const ahora = Date.now();
  const venceNuevo = venceExtendido(venceActual, ahora);
  if (venceNuevo - venceActual < MINIMO_EXTENSION_MS) {
    return error(422, "tope_vista", `La vista ya tiene el máximo de ${MINUTOS_SUPLANTACION_MAX} minutos por delante.`, {
      vence: venceActual,
    });
  }

  let tienda: { id: string; slug: string; name: string } | null = null;
  try {
    tienda = await TenantsDB.getBasicById(vista.tenantId);
  } catch (err) {
    logger.error("[superadmin/impersonate/extender] la tienda no cargó", { error: String(err) });
    return error(500, "db", "No se pudo leer la tienda. Prueba otra vez.");
  }
  if (!tienda) return error(404, "tienda_no_existe", "La tienda de esta vista ya no existe.");

  // Minutos que de verdad suma (15, o menos si el tope de 60 lo recorta).
  const minutos = Math.round((venceNuevo - venceActual) / 60_000);

  // Igual que al entrar: sin rastro en la auditoría no hay sesión más larga
  // (Ley 29733 Art. 16).
  try {
    await logSuperadminAction(
      "impersonate_extend",
      `Superadmin "${plataforma.username}" alargó ${minutos} min la vista de "${tienda.slug}" (${tienda.name}); vence ${new Date(venceNuevo).toISOString()}`,
      {
        targetTenantId: tienda.id,
        targetTenantSlug: tienda.slug,
        targetTenantName: tienda.name,
        minutos,
        minutosPedidos: MINUTOS_EXTENDER,
        venceAnterior: new Date(venceActual).toISOString(),
        venceNuevo: new Date(venceNuevo).toISOString(),
        ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
        userAgent: req.headers.get("user-agent") || null,
        timestamp: new Date(ahora).toISOString(),
      },
      plataforma.username,
    );
  } catch (err) {
    logger.error("[superadmin/impersonate/extender] audit log failed — refusing extension", {
      err: err instanceof Error ? err.message : String(err),
      superadmin: plataforma.username,
      targetTenant: tienda.slug,
    });
    return error(503, "audit_log_unavailable", "Audit trail no disponible — no se puede alargar la vista.");
  }

  const duracionMs = venceNuevo - ahora;
  const token = await createSessionToken(
    vista.role,
    vista.username,
    vista.tenantId,
    vista.name || `SuperAdmin→${tienda.slug}`,
    duracionMs,
  );

  // El token anterior no sigue valiendo hasta su vence viejo: una copia suya
  // queda fuera como tras «Salir». Ningún token de vista vive más de 60 min.
  if (vista.jti) cacheStore.set(`revoked-access:${vista.jti}`, true, VIDA_MAXIMA_SUPLANTACION_S);

  const res = NextResponse.json({ ok: true, vence: venceNuevo, minutos }, { headers: SIN_CACHE });
  // Las tres cookies mueren con el token nuevo, igual que al entrar (si la de la
  // tienda venciera antes, el proxy dejaría de resolverla con la sesión viva).
  const maxAge = Math.floor(duracionMs / 1000);
  const isProd = process.env.NODE_ENV === "production";
  res.cookies.set(SESSION.COOKIE_NAME, token, { httpOnly: true, secure: isProd, sameSite: "strict", path: "/", maxAge });
  res.cookies.set("active-tenant", tienda.id, { path: "/", maxAge, sameSite: "lax", httpOnly: false });
  res.cookies.set("active-tenant-slug", tienda.slug, { path: "/", maxAge, sameSite: "lax", httpOnly: false });
  return res;
}
