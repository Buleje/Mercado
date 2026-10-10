import { NextRequest, NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { createDistributedRateLimiter, getClientIp } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { KioskoAsistenciaDB } from "@/lib/db/rrhh-kiosko.db";
import { nuevoSecretoAparato, secretoCoincide } from "@/lib/rrhh/kiosko-token.server";
import { MARCADO_POR_KIOSKO, kioskoEmparejarSchema, partirToken, revisarEnlace, type RespuestaEmparejar } from "@/lib/rrhh/kiosko";
import {
  COOKIE_APARATO_KIOSKO,
  MENSAJE_OTRO_APARATO,
  RUTA_COOKIE_APARATO,
  estadoAparato,
  resumirAparato,
  vidaCookieAparato,
} from "@/lib/rrhh/kiosko-aparato";

/**
 * POST /api/kiosko/emparejar — la tablet, al abrir el enlace del kiosko
 * (`lib/rrhh/kiosko-aparato.ts`). PÚBLICA: manda `{ token }`.
 *
 *  · enlace sin tablet → se ata a ÉSTA: cookie httpOnly `SameSite=Strict`
 *    con un secreto propio; la configuración guarda su hash;
 *  · es la tablet atada → ok;
 *  · el enlace ya está atado a otro aparato → 403 `otro_aparato`.
 *
 * 200 · 400 datos · 401 enlace inválido/vencido · 403 apagado/otro aparato · 429.
 * Cupo por IP compartido entre instancias (Redis): una tablet lo pide al abrir.
 */
const limite = createDistributedRateLimiter({ key: "kiosko:emparejar", maxRequests: 20, windowMs: 10 * 60_000 });

const SIN_CACHE = { "Cache-Control": "no-store" };
const falla = (status: number, error: string, message: string) =>
  NextResponse.json({ ok: false, error, message } satisfies RespuestaEmparejar, { status, headers: SIN_CACHE });

const MENSAJE_ENLACE = "Este enlace del kiosko ya no sirve. Pídele al encargado uno nuevo.";

export const POST = withApiHandler("kiosko-emparejar", async (req: NextRequest) => {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const ip = getClientIp(req);
  if (!(await limite.check(ip))) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Demasiados intentos. Espera unos minutos." } satisfies RespuestaEmparejar,
      { status: 429, headers: { ...SIN_CACHE, "Retry-After": String(Math.ceil(limite.windowMs / 1000)) } },
    );
  }

  const body = kioskoEmparejarSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return falla(400, "datos_invalidos", "No llegó el enlace del kiosko.");

  const ahora = new Date();
  const partes = partirToken(body.data.token);
  if (!partes) return falla(401, "enlace_invalido", MENSAJE_ENLACE);
  const tenantId = partes.tenantId;
  const config = await KioskoAsistenciaDB.config(tenantId);
  const enlace = revisarEnlace(config, secretoCoincide(partes.secreto, config.tokenHash), ahora);
  if (!enlace.ok) {
    if (enlace.motivo === "apagado") return falla(403, "apagado", "La marcación en el kiosko está apagada.");
    if (enlace.motivo === "vencido") return falla(401, "vencido", "El enlace del kiosko venció. Pídele al encargado uno nuevo.");
    return falla(401, "enlace_invalido", MENSAJE_ENLACE);
  }

  const fotoObligatoria = !config.permitirSinFoto;
  const cookie = req.cookies.get(COOKIE_APARATO_KIOSKO)?.value ?? "";
  const estado = estadoAparato(config, secretoCoincide(cookie, config.aparatoHash));
  if (estado === "propio") {
    return NextResponse.json({ ok: true, fotoObligatoria, recienAtada: false } satisfies RespuestaEmparejar, { headers: SIN_CACHE });
  }
  if (estado === "otro") return falla(403, "otro_aparato", MENSAJE_OTRO_APARATO);

  // Libre: se ata a esta tablet (el WHERE pide el mismo enlace y ningún aparato todavía).
  const { secreto, hash } = nuevoSecretoAparato();
  const nombre = resumirAparato(req.headers.get("user-agent"));
  const atada = await KioskoAsistenciaDB.atarAparato(tenantId, config.tokenHash ?? "", {
    aparatoHash: hash,
    aparatoEn: ahora.toISOString(),
    aparatoNombre: nombre,
  });
  if (!atada) return falla(403, "otro_aparato", MENSAJE_OTRO_APARATO);

  logActivity(
    "rrhh_kiosko_tablet",
    "KioskoAsistencia",
    `El enlace del kiosko (…${config.tokenFin ?? "????"}) quedó atado a una tablet: ${nombre} · IP ${ip}`,
    undefined,
    MARCADO_POR_KIOSKO,
    undefined,
    tenantId,
  ).catch((err) => logger.warn("[kiosko-emparejar] no se registró la actividad", { tenantId, error: String(err) }));

  const res = NextResponse.json({ ok: true, fotoObligatoria, recienAtada: true } satisfies RespuestaEmparejar, { headers: SIN_CACHE });
  res.cookies.set(COOKIE_APARATO_KIOSKO, secreto, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: RUTA_COOKIE_APARATO,
    maxAge: vidaCookieAparato(config.venceEn, ahora),
  });
  return res;
});
