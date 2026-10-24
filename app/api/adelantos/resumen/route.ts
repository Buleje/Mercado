import { NextRequest, NextResponse } from "next/server";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { logger } from "@/lib/logger";

// GET /api/adelantos/resumen — KPIs del módulo + los adelantos sin control
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  try {
    /* `sinControl` es un aviso: si su cuenta falla, el resumen igual sale
       (`null` = no se sabe, que la pantalla no confunde con «ninguno»). */
    const [resumen, sinControl] = await Promise.all([
      AdelantosDB.resumen(auth.tenantId),
      AdelantosDB.sinControl(auth.tenantId).catch((e: unknown) => {
        logger.error("[adelantos/resumen] sinControl error", { err: e instanceof Error ? e.message : String(e) });
        return null;
      }),
    ]);
    return NextResponse.json({ ...resumen, sinControl }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (e) {
    logger.error("[adelantos/resumen] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
