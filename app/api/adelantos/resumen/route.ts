import { NextRequest, NextResponse } from "next/server";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { AdelantosHoyTocaDB } from "@/lib/db/adelantos-hoy-toca.db";
import { requireAdmin } from "@/lib/require-admin";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { logger } from "@/lib/logger";

// GET /api/adelantos/resumen — KPIs del módulo + «Hoy toca» (cuatro cifras y las tareas, 25-10)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  try {
    /* `hoyToca` es un aviso: si su cuenta falla, el resumen igual sale
       (`null` = no se sabe, que la pantalla no confunde con «nada que hacer»).
       Reemplaza a `sinControl`: sus tres motivos (quieto, sin fecha, vencido)
       ahora son las tareas «Cobrar» y «Poner fecha». */
    const [resumen, hoyToca] = await Promise.all([
      AdelantosDB.resumen(auth.tenantId),
      AdelantosHoyTocaDB.hoyToca(auth.tenantId).catch((e: unknown) => {
        logger.error("[adelantos/resumen] hoyToca error", { err: e instanceof Error ? e.message : String(e) });
        return null;
      }),
    ]);
    return NextResponse.json({ ...resumen, hoyToca }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (e) {
    logger.error("[adelantos/resumen] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
