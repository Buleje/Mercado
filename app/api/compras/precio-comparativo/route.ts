import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { getComparativoPrecios } from "@/lib/db/compras-precio-comparativo.db";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;
  const productId = req.nextUrl.searchParams.get("productId");

  if (!productId || isNaN(Number(productId))) {
    return NextResponse.json({ error: "productId requerido" }, { status: 400 });
  }

  try {
    const comparaciones = await getComparativoPrecios(tenantId, Number(productId));

    return NextResponse.json({ comparaciones });
  } catch (e) {
    logger.error("[compras/precio-comparativo] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error obteniendo comparaciones" }, { status: 500 });
  }
}
