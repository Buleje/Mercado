export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { PriceHistoryDB } from "@/lib/db/products.db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "ID de producto inválido" }, { status: 400 });
    }

    const history = await PriceHistoryDB.getByProduct(productId);
    return NextResponse.json(history);
  } catch (e) {
    logger.error("[products/id/price-history] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error al obtener historial" }, { status: 503 });
  }
}
