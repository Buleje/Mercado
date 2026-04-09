import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get all active products with stock
    const products = await prisma.product.findMany({
      where: { active: true },
      select: { id: true, name: true, category: true, stock: true, unit: true },
    });

    // Get sale movements from the last 30 days
    const movements = await prisma.inventoryMovement.findMany({
      where: {
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
      // Only include products that have sales data OR low stock
      .filter((p) => p.avgDailySales > 0)
      // Sort by days remaining ascending (most urgent first)
      .sort((a, b) => {
        if (a.daysRemaining === null) return 1;
        if (b.daysRemaining === null) return -1;
        return a.daysRemaining - b.daysRemaining;
      })
      .slice(0, 20);

    return NextResponse.json(predictions);
  } catch (err) {
    console.error("stock-prediction error:", err);
    return NextResponse.json(
      { error: "Error al calcular la prediccion de stock" },
      { status: 500 }
    );
  }
}
