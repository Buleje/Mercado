import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { PorCobrarDB } from "@/lib/db/por-cobrar.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/por-cobrar
 * Resumen consolidado de cuentas por cobrar (Fiados + Préstamos + Adelantos +
 * madera despachada a cuenta). Solo lectura, tenant-scoped vía requireAdmin.
 *
 * `?detalle=1` agrega `items`: una fila por deuda (quién, cuánto, desde cuándo,
 * cuándo vence, y el id con el que su módulo abre el detalle). Con `detalle=1`
 * el resumen se DERIVA de esas mismas filas, así la pantalla no puede mostrar
 * un total que no cierre con la lista que tiene debajo.
 */
const Query = z.object({
  detalle: z.enum(["0", "1", "true", "false"]).optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }
  const conDetalle = parsed.data.detalle === "1" || parsed.data.detalle === "true";

  try {
    const data = conDetalle
      ? await PorCobrarDB.getDetalle(auth.tenantId)
      : await PorCobrarDB.getSummary(auth.tenantId);
    return NextResponse.json(data);
  } catch (e) {
    logger.error("[por-cobrar GET] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
