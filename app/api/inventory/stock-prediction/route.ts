import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line no-restricted-properties -- legacy: ProductsDB no expone campo unit ni inventoryMovement bulk; migrar a DB class en sprint posterior.
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";


export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Scoped to tenant — prevents cross-tenant stock leak
    const products = await prisma.product.findMany({
      where: { active: true, tenantId: auth.tenantId },
      select: { id: true, name: true, category: true, stock: true, unit: true },
    });

    // Scoped movements to tenant products
    const productIds = products.map((p) => p.id);
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        tenantId: auth.tenantId,
        productId: { in: productIds },
        type: { in: ["venta", "venta_online"] },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { productId: true, quantity: true },
    });

    // Aggregate sales per product
    const salesMap = new Map<number, number>();
    for (const m of movements) {
      salesMap.set(m.productId, (salesMap.get(m.productId) || 0) + m.quantity);
    }

    // Calculate predictions
    const predictions = products
      .map((p) => {
        const totalSold = salesMap.get(p.id) || 0;
        const avgDailySales = totalSold / 30;
        const stock = p.stock ?? 0;
        const daysRemaining = avgDailySales > 0 ? stock / avgDailySales : null;

        return {
          productId: p.id,
          productName: p.name,
          category: p.category,
          stock,
          unit: p.unit,
          avgDailySales,
          daysRemaining,
        };
      })
      .filter((p) => p.avgDailySales > 0)
      .sort((a, b) => {
        if (a.daysRemaining === null) return 1;
        if (b.daysRemaining === null) return -1;
        return a.daysRemaining - b.daysRemaining;
      })
      .slice(0, 20);

    return NextResponse.json(predictions);
  } catch (err) {
    logger.error("[stock-prediction] error", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: "Error al calcular la prediccion de stock" },
      { status: 500 }
    );
  }
}
