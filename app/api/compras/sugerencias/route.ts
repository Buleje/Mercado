import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import {
  getProductosConStockMin,
  getVentasPor30Dias,
  getUltimaCompraPorProducto,
} from "@/lib/db/compras-sugerencias.db";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Get all active products with stockMin > 0
    const products = await getProductosConStockMin(tenantId);

    if (products.length === 0) {
      return NextResponse.json({ sugerencias: [] });
    }

    const productIds = products.map((p) => p.id);

    // 2. Get daily average sales for each product (last 30 days)
    const salesMap = await getVentasPor30Dias(tenantId, productIds, thirtyDaysAgo);

    // 3. Get last purchase info for each product (graceful — tolera schema drift)
    const lastPurchaseMap = await getUltimaCompraPorProducto(tenantId, productIds);

    // 4. Calculate suggestions
    type Urgency = "CRITICO" | "URGENTE" | "PLANIFICAR";
    const urgencyOrder: Record<Urgency, number> = { CRITICO: 0, URGENTE: 1, PLANIFICAR: 2 };

    const sugerencias = products
      .map((p) => {
        const currentStock = p.stock ?? 0;
        const dailyAvg = salesMap.get(p.id) ?? 0;
        const daysOfStock = dailyAvg > 0 ? currentStock / dailyAvg : Infinity;
        const suggestedQty = Math.ceil(15 * dailyAvg - currentStock);

        if (suggestedQty <= 0) return null;

        const urgency: Urgency =
          daysOfStock <= 3 ? "CRITICO" : daysOfStock <= 7 ? "URGENTE" : "PLANIFICAR";

        const lastPurchase = lastPurchaseMap.get(p.id);

        return {
          productId: p.id,
          productName: p.name,
          category: p.category,
          currentStock,
          stockMin: p.stockMin ?? 0,
          dailyAvg: Math.round(dailyAvg * 100) / 100,
          daysOfStock: daysOfStock === Infinity ? 9999 : Math.round(daysOfStock * 10) / 10,
          suggestedQty,
          suggestedSupplier: lastPurchase
            ? { id: lastPurchase.supplierId, name: lastPurchase.supplierName }
            : null,
          lastPrice: lastPurchase?.lastPrice ?? null,
          urgency,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const ua = urgencyOrder[a!.urgency as Urgency];
        const ub = urgencyOrder[b!.urgency as Urgency];
        if (ua !== ub) return ua - ub;
        return (a!.daysOfStock ?? 9999) - (b!.daysOfStock ?? 9999);
      });

    return NextResponse.json({ sugerencias });
  } catch (e) {
    logger.error("[compras/sugerencias] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error calculando sugerencias" }, { status: 500 });
  }
}
