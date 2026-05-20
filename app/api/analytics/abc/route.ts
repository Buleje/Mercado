import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AnalyticsABCDB } from "@/lib/db/analytics-abc.db";
import { logger } from "@/lib/logger";

export type ABCProduct = {
  productId: number;
  name: string;
  revenue: number;
  units: number;
  category: string;
  class: "A" | "B" | "C";
  cumulativePct: number;
};

/**
 * GET /api/analytics/abc
 * Returns ABC classification of all products based on revenue.
 * A = cumulative 0-70%, B = 70-90%, C = 90-100%
 *
 * SECURITY FIX (audit 2026-05-19): el endpoint original no filtraba saleItem
 * ni orderItem por tenantId — cross-tenant data leak. Ahora ambas queries
 * filtran por tenantId via relacion con Sale/Order en la DB class.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const tenantId = auth.tenantId;

    const [saleItems, orderItems] = await Promise.all([
      AnalyticsABCDB.getSaleItemsForABC(tenantId),
      AnalyticsABCDB.getOrderItemsForABC(tenantId),
    ]);

    // Aggregate revenue by productId
    const map = new Map<number, { units: number; revenue: number }>();

    for (const item of saleItems) {
      const existing = map.get(item.productId) ?? { units: 0, revenue: 0 };
      existing.units += item.quantity;
      // DB class ya convirtio Decimal -> number
      existing.revenue += item.price * item.quantity;
      map.set(item.productId, existing);
    }

    for (const item of orderItems) {
      if (!item.productId) continue;
      const existing = map.get(item.productId) ?? { units: 0, revenue: 0 };
      existing.units += item.quantity;
      // DB class ya convirtio Decimal -> number
      existing.revenue += item.price * item.quantity;
      map.set(item.productId, existing);
    }

    if (map.size === 0) {
      return NextResponse.json([]);
    }

    // Load product metadata (con tenantId para aislamiento multi-tenant)
    const productIds = Array.from(map.keys());
    const products = await AnalyticsABCDB.getProductMetaForABC(tenantId, productIds);
    const productMeta = new Map(products.map(p => [p.id, p]));

    // Sort by revenue descending
    const sorted = Array.from(map.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue);

    const totalRevenue = sorted.reduce((s, [, v]) => s + v.revenue, 0);
    if (totalRevenue === 0) return NextResponse.json([]);

    let cumulative = 0;
    const result: ABCProduct[] = sorted.map(([productId, v]) => {
      cumulative += v.revenue;
      const cumulativePct = (cumulative / totalRevenue) * 100;
      const cls: "A" | "B" | "C" = cumulativePct <= 70 ? "A" : cumulativePct <= 90 ? "B" : "C";
      const meta = productMeta.get(productId);
      return {
        productId,
        name: meta?.name ?? `Producto #${productId}`,
        category: meta?.category ?? "",
        revenue: Math.round(v.revenue * 100) / 100,
        units: v.units,
        class: cls,
        cumulativePct: Math.round(cumulativePct * 10) / 10,
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    logger.error("[abc] error", { error: (e as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
