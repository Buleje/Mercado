import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Get purchase items from last 90 days
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const items = await prisma.purchaseItem.groupBy({
      by: ["productId", "name"],
      where: { purchaseOrder: { createdAt: { gte: since } } },
      _count: { productId: true },
      _avg: { quantity: true, unitCost: true },
      orderBy: { _count: { productId: "desc" } },
      take: 20,
    });

    const result = items.map((item) => ({
      productId: item.productId,
      name: item.name,
      frequency: item._count.productId,
      avgQuantity: Math.round(item._avg.quantity ?? 0),
      avgCost: Number((item._avg.unitCost ?? 0).toFixed(2)),
    }));

    return NextResponse.json(result);
  } catch {
    // Fallback: return empty if query fails or model doesn't exist yet
    return NextResponse.json([]);
  }
}
