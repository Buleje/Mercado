import { NextRequest, NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { vistaPreviaSchema } from "@/lib/forestal/reporte-diario";
import { enviarPruebaDeReporte } from "@/lib/forestal/reporte-diario-envio";
import { autorizarReportes, errorDeValidacion, errorInterno, leerJson, SIN_CACHE } from "@/lib/forestal/reporte-diario-ruta";

/**
 * POST /api/admin/forestal/reportes-diarios/prueba — «Enviarme una prueba».
 *
 * Arma el reporte con los datos de HOY (lo que el editor tiene en pantalla) y
 * lo manda al correo del dueño del negocio, nunca a uno que venga en el cuerpo.
 * Tope de pruebas por día contado en `NotificationLog`. → `{ ok, destino, asunto }`.
 */
export const POST = withApiHandler("forestal-reportes-diarios-prueba", async (req: NextRequest) => {
  const auth = await autorizarReportes(req);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "STRICT", "reportes-diarios-prueba");
  if (rl) return rl;
  const j = await leerJson(req);
  if (!j.ok) return j.res;
  const parsed = vistaPreviaSchema.safeParse(j.body);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  try {
    const r = await enviarPruebaDeReporte(auth.tenantId, parsed.data, auth.username, new Date());
    if (r.ok) return NextResponse.json(r, { headers: SIN_CACHE });
    const status = r.motivo === "tope" ? 429 : r.motivo === "sin_correo" ? 422 : 502;
    return NextResponse.json({ error: r.motivo, message: r.mensaje }, { status, headers: SIN_CACHE });
  } catch (err) {
    return errorInterno(err, "prueba", auth.tenantId);
  }
});
