import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestAnexosDB } from "@/lib/db/forest-anexos.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { limaDateKey } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/admin/forestal/salidas-por-registrar — los Anexos 04 con N° de GTF
 * cuya salida todavía no está en el Libro CTP, con su `venceEl` y si ya están
 * fuera de plazo (`lib/forestal/salidas-por-registrar.ts`). Lo pide la campana
 * y la sección Despacho del Libro. Un tenant sin módulo forestal recibe lista
 * vacía (no 403: la campana lo pide a todos los que pueden leerlo).
 */
export const GET = withApiHandler("forestal-salidas-por-registrar-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, RUTAS_PANEL["/api/admin/forestal/salidas-por-registrar"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "salidas-por-registrar");
  if (rl) return rl;
  const hoy = limaDateKey();
  try {
    const [herramientas, libro] = await Promise.all([
      isSpecializationEnabled(auth.tenantId, "spec:forestal:herramientas"),
      isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"),
    ]);
    if (!herramientas && !libro) return NextResponse.json({ hoy, salidas: [] });
    const salidas = await ForestAnexosDB.salidasPorRegistrar(auth.tenantId, hoy);
    return NextResponse.json({ hoy, salidas });
  } catch (err) {
    logger.error("[salidas-por-registrar.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
