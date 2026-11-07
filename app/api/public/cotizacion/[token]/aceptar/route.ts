import { NextRequest, NextResponse } from "next/server";
import { createDistributedRateLimiter, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { AceptarCotizacionSchema, aceptarCotizacionPublica } from "@/lib/cotizaciones/aceptar-publico";
import { verificarTokenCotizacion } from "@/lib/cotizaciones/enlace-token";

/**
 * POST /api/public/cotizacion/[token]/aceptar — el cliente acepta la cotización
 * desde su enlace, SIN sesión (noche 04-11, tramo 2). Cuerpo: `{ nombre }`.
 *
 * - Negocio y cotización salen del token firmado (propósito `cot`), nunca del cuerpo.
 * - Fuera de `/api/admin` y de los prefijos de escritura protegida: el filtro de
 *   login no la toca. CSRF sí (no está exenta): la página pública siembra la
 *   cookie `csrf-token` y el botón manda `x-csrf-token` (doble envío).
 * - Cupo compartido entre instancias: 5 cada 10 min por IP y 5 cada 10 min por
 *   cotización (todos sus enlaces suman al mismo cupo).
 * - 404 genérico para cualquier enlace no válido (alterado, vencido, de estado de
 *   cuenta, de otro negocio): no dice cuál.
 */
const VENTANA_MS = 10 * 60_000;
const porIp = createDistributedRateLimiter({ key: "cotizacion-aceptar-ip", maxRequests: 5, windowMs: VENTANA_MS });
const porCotizacion = createDistributedRateLimiter({ key: "cotizacion-aceptar-cot", maxRequests: 5, windowMs: VENTANA_MS });
const CABECERAS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const CUERPO_MAX = 2_000;

function json(cuerpo: Record<string, unknown>, status: number, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json(cuerpo, { status, headers: { ...CABECERAS, ...extra } });
}

const muchos = () =>
  json({ error: "Demasiados intentos. Prueba en unos minutos." }, 429, { "Retry-After": String(VENTANA_MS / 1000) });
const noValido = () => json({ error: "Este enlace no es válido. Pide uno nuevo a quien te envió la cotización." }, 404);

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(req);
  if (!(await porIp.check(ip))) return muchos();

  const { token } = await params;
  const v = verificarTokenCotizacion(token);
  if (!v.valido) return noValido();
  if (!(await porCotizacion.check(`${v.tenantId}:${v.cotizacionId}`))) return muchos();

  /* Frenar antes de leer: un cuerpo enorme no llega a memoria (security 04-11). */
  if (Number(req.headers.get("content-length") ?? 0) > CUERPO_MAX) return json({ error: "Datos inválidos" }, 400);
  const crudo = await req.text().catch(() => "");
  if (crudo.length > CUERPO_MAX) return json({ error: "Datos inválidos" }, 400);
  let datos: unknown = null;
  try {
    datos = crudo ? JSON.parse(crudo) : null;
  } catch {
    datos = null;
  }
  const parsed = AceptarCotizacionSchema.safeParse(datos ?? {});
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Escribe tu nombre." }, 400);
  }

  try {
    const r = await aceptarCotizacionPublica(token, parsed.data.nombre, { ip, userAgent: req.headers.get("user-agent") });
    if (r.ok) return json({ ok: true, estado: "ACEPTADA", numero: r.numero, nombre: r.nombre, aceptadaEl: r.aceptadaEl }, 200);
    if (r.status === 404) return noValido();
    const error = r.vencida
      ? "Esta cotización ya venció: no se puede aceptar. Pide que te la renueven."
      : "Esta cotización ya no se puede aceptar.";
    return json({ error, ...(r.estado ? { estado: r.estado } : {}) }, 409);
  } catch (err) {
    logger.error("[public/cotizacion/aceptar] aceptar falló", { error: String(err) });
    return json({ error: "No se pudo aceptar ahora. Prueba de nuevo en un momento." }, 503);
  }
}
