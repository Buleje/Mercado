import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createDistributedRateLimiter, getClientIp } from "@/lib/rate-limit";
import { origenDeLaPeticion } from "@/lib/seo/origen-de-la-peticion";
import { AgendaConexionesDB, hashTokenFeed } from "@/lib/db/agenda-conexiones.db";
import { RUTA_PANEL_AGENDA, armarIcs } from "@/lib/agenda/ics";

/**
 * GET /api/public/agenda-ics/[token] — el calendario de la agenda de Administración
 * (ADR-501 §5a) para suscribirse desde Google Calendar, Outlook o Apple.
 *
 *  · Sin sesión: el secreto es el token (32 bytes base64url, en la base sólo su sha256).
 *    Se acepta con o sin «.ics» al final (Outlook lo prefiere).
 *  · Sin token válido o revocado → 404 genérico, el mismo en todos los casos.
 *  · Sin montos: sólo nombres («Revisar la cuenta de Juan»); `sinMontos` tacha lo que se
 *    cuele en notas y títulos. Sólo lo que el feed `incluye`.
 *  · Límite por IP con el cupo compartido entre instancias (STRICT: 10 cada 15 min;
 *    Google y Outlook lo piden cada varias horas).
 */

const limite = createDistributedRateLimiter({ key: "agenda-ics", maxRequests: 10, windowMs: 15 * 60_000 });
const TOKEN_VALIDO = /^[A-Za-z0-9_-]{43}$/;
const CABECERAS_BASE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

function texto(cuerpo: string, status: number, extra: Record<string, string> = {}): NextResponse {
  return new NextResponse(cuerpo, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...CABECERAS_BASE, ...extra },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!(await limite.check(getClientIp(req)))) {
    return texto("Demasiadas consultas. Prueba en unos minutos.", 429, { "Retry-After": String(15 * 60) });
  }

  const { token: crudo } = await params;
  const token = crudo.endsWith(".ics") ? crudo.slice(0, -4) : crudo;
  if (!TOKEN_VALIDO.test(token)) return texto("No encontrado", 404);

  try {
    const feed = await AgendaConexionesDB.feedPorToken(hashTokenFeed(token));
    if (!feed) return texto("No encontrado", 404);

    const datos = await AgendaConexionesDB.datosParaIcs(feed.tenantId, feed.incluye);
    const origen = await origenDeLaPeticion();
    const ics = armarIcs(datos, { nombreCalendario: feed.nombre, urlPanel: `${origen}${RUTA_PANEL_AGENDA}` });
    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="agenda.ics"',
        ...CABECERAS_BASE,
      },
    });
  } catch (e) {
    logger.error("[agenda-ics] no se pudo armar el calendario", { error: e instanceof Error ? e.message : String(e) });
    return texto("No disponible por ahora", 503, { "Retry-After": "300" });
  }
}
