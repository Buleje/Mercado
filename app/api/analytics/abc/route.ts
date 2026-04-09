import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

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
 * A = cumulative 0–70%, B = 70–90%, C = 90–100%
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const [saleItems, orderItems] = await Promise.all([
      // POS sales
      prisma.saleItem.groupBy({
        by: ["productId"],
        _sum: { quantity: true },
        _count: { id: true },
      }),
      // Online orders (non-cancelled)
      prisma.orderItem.findMany({
        where: { productId: { not: null }, order: { status: { not: "cancelado" } } },
        select: { productId: true, price: true, quantity: true },
      }),
    ]);

    // Aggregate revenue by productId
    const map = new Map<number, { units: number; revenue: number }>();

    // Sum from sales using current product prices (we have qty, compute revenue from SaleItem price)
    const saleItemDetails = await prisma.saleItem.findMany({
      select: { productId: true, price: true, quantity: true },
    });
    for (const item of saleItemDetails) {
      const existing = map.get(item.productId) ?? { units: 0, revenue: 0 };
      existing.units += item.quantity;
      existing.revenue += item.price * item.quantity;
      map.set(item.productId, existing);
    }
    void saleItems; // already aggregated via detailed query

    for (const item of orderItems) {
      if (!item.productId) continue;
      const existing = map.get(item.productId) ?? { units: 0, revenue: 0 };
      existing.units += item.quantity;
      existing.revenue += item.price * item.quantity;
      map.set(item.productId, existing);
    }

    if (map.size === 0) {
      return NextResponse.json([]);
    }

    // Load product metadata
    const productIds = Array.from(map.keys());
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, category: true },
    });
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
    console.error("[abc] error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
