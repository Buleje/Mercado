import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestPlantacionesDB } from "@/lib/db/forest-plantaciones.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/** /api/admin/forestal/plantaciones/[id] — el detalle completo (bloques →
 *  vértices + especies) para "Continuar"/"Editar"/"Ver"/generar el documento. */
export const GET = withApiHandler("forestal-plantacion-get-one", async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const ok = await isSpecializationEnabled(auth.tenantId, "spec:forestal:tramites");
  if (!ok) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo Trámites y Oficios no está habilitado para esta tienda." },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;
  try {
    const plantacion = await ForestPlantacionesDB.getById(auth.tenantId, id);
    if (!plantacion) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ plantacion });
  } catch (err) {
    logger.error("[plantaciones.GET_ONE] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
