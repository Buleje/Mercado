import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { getPresupuestoCompras } from "@/lib/db/compras-presupuesto.db";

/**
 * GET /api/compras/presupuesto — lo comprado en el mes contra el presupuesto
 * de compras (N02). El techo se fija con PUT /api/expenses/presupuesto y la
 * categoría «compras:total» o «compras:prov:<id>» (sólo admin/dueño/encargado).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await getPresupuestoCompras(auth.tenantId);
    return NextResponse.json(data);
  } catch (err) {
    logger.error("[compras/presupuesto] GET error", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "No se pudo calcular el presupuesto de compras" }, { status: 500 });
  }
}
