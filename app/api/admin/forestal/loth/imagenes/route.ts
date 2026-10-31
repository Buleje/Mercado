import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit, applyRateLimitWithTenant } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { PLAN_ID_VALIDO } from "@/lib/forestal/loth-alcance-geo";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { contextoDelPlan } from "@/lib/forestal/loth-geografia-servidor";
import { obtenerImagenes } from "@/lib/forestal/loth-imagenes-servidor";

/**
 * /api/admin/forestal/loth/imagenes — las imágenes RECIENTES de la zona de
 * trabajo del Libro TH para el mapa:
 *
 *   · escenas de Sentinel-2 de los últimos 90 días (Planetary Computer), con
 *     las nubes medidas SOBRE EL ÁREA y la escena sugerida (la más nueva con
 *     ≤ 30 % de nubes);
 *   · de cuándo es la foto de Esri en el centro del área;
 *   · qué día y satélite de NASA GIBS tiene imagen de hoy (o de ayer).
 *
 * GET ?planId=X             → de la caché (6 h) o de internet
 * GET ?planId=X&refrescar=1 → lo vuelve a pedir (6 por hora por negocio)
 *
 * El recuadro lo arma el SERVIDOR con el contorno y los árboles guardados del
 * negocio —no se acepta uno del navegador—: el endpoint no sirve de proxy
 * abierto al catálogo. Las TESELAS van directo del navegador a cada servicio
 * (`img-src https:` ya las permite): esto es una llamada por sesión.
 *
 * Un servicio caído no da 500: responde con lo guardado o vacío, y lo dice en
 * `avisos`. Zona sin nada (ni contorno ni árboles) da 422 con el motivo.
 *
 * Guard: requireAdmin → rate limit → spec:forestal:loth-libro.
 */

const querySchema = z.object({
  planId: z.string().trim().regex(PLAN_ID_VALIDO, "El permiso no es válido.").optional(),
  refrescar: z.enum(["0", "1", "true", "false"]).optional(),
});

export const GET = withApiHandler("forestal-loth-imagenes", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const sp = new URL(req.url).searchParams;
  const parsed = querySchema.safeParse({ planId: sp.get("planId") ?? undefined, refrescar: sp.get("refrescar") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const refrescar = parsed.data.refrescar === "1" || parsed.data.refrescar === "true";

  // Refrescar sale a servicios públicos gratuitos (hasta ~30 consultas): tope propio por NEGOCIO.
  const rl = refrescar
    ? applyRateLimitWithTenant(req, "MODERATE", auth.tenantId, "loth-imagenes-refrescar", { maxReqs: 6, windowSec: 60 * 60 })
    : applyRateLimit(req, "GENEROUS", "loth-imagenes");
  if (rl) return rl;

  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  try {
    // Un permiso ajeno o dado de baja no abre filas de caché ni sale a internet.
    if (parsed.data.planId && !(await ForestPlanDB.getPlan(auth.tenantId, parsed.data.planId))) {
      return NextResponse.json({ error: "plan_not_found", message: "Ese permiso no existe en este negocio o fue dado de baja." }, { status: 404 });
    }
    const ctx = await contextoDelPlan(auth.tenantId, parsed.data.planId || null);
    const r = await obtenerImagenes(auth.tenantId, ctx, { refrescar, user: auth.username ?? "unknown" });
    if (!r.ok) return NextResponse.json({ error: "zona_invalida", message: r.motivo }, { status: 422 });
    return NextResponse.json({ planId: ctx.planId, ...r.imagenes });
  } catch (err) {
    // Nunca un 500 por esto: el mapa sigue con sus bases de siempre y lo dice.
    logger.error("[loth.imagenes.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ planId: parsed.data.planId ?? null, escenas: [], sugerida: null, esri: null, vivas: null, avisos: ["No se pudieron buscar las imágenes recientes ahora. Vuelve a intentar en unos minutos."] });
  }
});
