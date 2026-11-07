import { NextRequest, NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { vistaPreviaSchema } from "@/lib/forestal/reporte-diario";
import { armarReporteDe } from "@/lib/forestal/reporte-diario-envio";
import { autorizarReportes, errorDeValidacion, errorInterno, leerJson, SIN_CACHE } from "@/lib/forestal/reporte-diario-ruta";

/**
 * POST /api/admin/forestal/reportes-diarios/vista-previa (ADR-439)
 *
 * Arma el reporte con los datos de HOY y lo devuelve SIN mandarlo:
 * `{ asunto, html, texto, desde, hasta, fallidas }`. Recibe lo que el editor
 * tiene en pantalla (secciones + rango + nombre), guardado o no: la vista
 * previa sirve justamente para decidir antes de guardar.
 *
 * POST y no GET: el cuerpo es una configuración, y lee bastante del libro —
 * por eso también el tope MODERATE.
 */
export const POST = withApiHandler("forestal-reportes-diarios-vista-previa", async (req: NextRequest) => {
  const auth = await autorizarReportes(req);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "reportes-diarios-vista");
  if (rl) return rl;
  const j = await leerJson(req);
  if (!j.ok) return j.res;
  const parsed = vistaPreviaSchema.safeParse(j.body);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  try {
    const armado = await armarReporteDe(auth.tenantId, parsed.data, new Date());
    return NextResponse.json(armado, { headers: SIN_CACHE });
  } catch (err) {
    return errorInterno(err, "vista-previa", auth.tenantId);
  }
});
