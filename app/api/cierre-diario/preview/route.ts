import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { armarCierreDelDia } from "@/lib/caja/cierre-del-dia.server";
import { ROLES_CIERRE_DEL_DIA } from "@/lib/caja/cierres-por-dia";
import { logger } from "@/lib/logger";

/**
 * GET — lo que muestra el modal «Cerrar el día» antes de guardar. La cuenta es
 * `armarCierreDelDia`, la MISMA que usa el POST para guardar (19-10).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_CIERRE_DEL_DIA);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await armarCierreDelDia(auth.tenantId));
  } catch (e) {
    logger.error("[cierre-diario/preview] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al generar preview" }, { status: 503 });
  }
}
