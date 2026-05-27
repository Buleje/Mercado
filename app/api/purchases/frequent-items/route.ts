import { NextRequest, NextResponse } from "next/server";
 
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";


export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // Get purchase items from last 90 days scoped to tenant — prevents cross-tenant cost leak
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const items = await prisma.purchaseItem.groupBy({
      by: ["productId", "name"],
      where: {
        purchaseOrder: {
          tenantId: auth.tenantId,
          createdAt: { gte: since },
        },
      },
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
  } catch (err) {
    logger.error("[purchases/frequent-items] error", { err: err instanceof Error ? err.message : String(err) });
    // Fallback: return empty if query fails or model doesn't exist yet
    return NextResponse.json([]);
  }
}
