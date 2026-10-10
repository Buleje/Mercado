import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit, applyRateLimitWithTenant } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { PLAN_ID_VALIDO } from "@/lib/forestal/loth-alcance-geo";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { contextoDelPlan, obtenerGeografia } from "@/lib/forestal/loth-geografia-servidor";

/**
 * /api/admin/forestal/loth/geografia — la geografía REAL de la zona de
 * trabajo del Libro TH: ríos y caminos de OpenStreetMap + grilla de altitud.
 *
 * GET ?planId=X            → de la caché (o de internet la primera vez)
 * GET ?planId=X&refrescar=1 → la vuelve a pedir a internet
 * GET ?planId=X&soloCache=1 → sólo lo guardado, NUNCA sale a internet (la
 *   pendiente de las rutas del mapa: si no hay relieve guardado, no se trae)
 *   (sin planId = el plan activo)
 *
 * → { bbox, base, rios[], caminos[], elevacion{nx,ny,bbox,valores}|null,
 *     fuentes{osm,elevacion}, avisos[], desdeCache }
 *
 * El recuadro lo arma el SERVIDOR con el contorno y los árboles guardados del
 * negocio —no se acepta uno del navegador—: así el endpoint no sirve de proxy
 * abierto a Overpass. Un servicio caído no da 500: responde con la caché o
 * vacío, y lo dice en `avisos`. Sólo zona sin nada (ni contorno ni árboles) o
 * demasiado grande da 422 con el motivo.
 *
 * Tiempo: OpenStreetMap (≤ 12 s entre espejos) y la altitud (≤ 8 s) van a
 * la vez: nunca se acerca a los 30 s en que Vercel corta la ruta. Tras un
 * fallo no se vuelve a salir a internet por 10 min (salvo `refrescar`).
 *
 * Guard: requireAdmin → rate limit (refrescar: 6 por hora por negocio, sale a
 * servicios públicos) → spec:forestal:loth-libro.
 */

const querySchema = z.object({
  planId: z.string().trim().regex(PLAN_ID_VALIDO, "El permiso no es válido.").optional(),
  refrescar: z.enum(["0", "1", "true", "false"]).optional(),
  soloCache: z.enum(["0", "1", "true", "false"]).optional(),
});

export const GET = withApiHandler("forestal-loth-geografia", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const sp = new URL(req.url).searchParams;
  const parsed = querySchema.safeParse({
    planId: sp.get("planId") ?? undefined,
    refrescar: sp.get("refrescar") ?? undefined,
    soloCache: sp.get("soloCache") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const refrescar = parsed.data.refrescar === "1" || parsed.data.refrescar === "true";
  const soloCache = parsed.data.soloCache === "1" || parsed.data.soloCache === "true";

  // Refrescar sale a servicios públicos gratuitos: tope propio por NEGOCIO (6 por hora), además del de la IP.
  const rl = refrescar
    ? applyRateLimitWithTenant(req, "MODERATE", auth.tenantId, "loth-geografia-refrescar", { maxReqs: 6, windowSec: 60 * 60 })
    : applyRateLimit(req, "GENEROUS", "loth-geografia");
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
    const r = await obtenerGeografia(auth.tenantId, ctx, { refrescar, soloCache, user: auth.username ?? "unknown" });
    if (!r.ok) return NextResponse.json({ error: "zona_invalida", message: r.motivo }, { status: 422 });
    return NextResponse.json({ planId: ctx.planId, ...r.geografia });
  } catch (err) {
    logger.error("[loth.geografia.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
