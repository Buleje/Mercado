import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/stats
 * Lightweight aggregate stats for the admin header / real-time widget.
 * Uses COUNT and SUM queries directly instead of loading full datasets.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6); // rolling 7 days

    const [
      pendingOrders,
      todayOrders,
      todayRevenueResult,
      lowStockProducts,
      weekOrders,
      totalCustomers,
    ] = await Promise.all([
      // Active pending orders
      prisma.order.count({ where: { status: "pendiente" } }),

      // Orders placed today
      prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),

      // Revenue from non-cancelled orders today
      prisma.order.aggregate({
        _sum: { total: true },
        where: {
          createdAt: { gte: startOfToday },
          status: { notIn: ["cancelado"] },
        },
      }),

      // Products with stock at or below minimum threshold
      prisma.product.count({
        where: {
          active: true,
          stock: { not: null },
          stockMin: { not: null },
          // Prisma doesn't support column comparisons directly;
          // use a raw-ish workaround by checking stock <= 0 OR use a post-filter.
          // We'll fetch the count via a raw query instead.
        },
      }),

      // Orders in the last 7 days
      prisma.order.count({ where: { createdAt: { gte: startOfWeek } } }),

      // Total customers
      prisma.customer.count(),
    ]);

    // Low stock: Prisma doesn't support "fieldA <= fieldB" directly, use $queryRaw
    const lowStockResult = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "Product"
      WHERE active = true AND stock IS NOT NULL AND "stockMin" IS NOT NULL AND stock <= "stockMin"
    `;
    const lowStockCount = Number(lowStockResult[0]?.count ?? 0);

    // Suppress unused variable warning (the simple count was replaced by raw query)
    void lowStockProducts;

    return NextResponse.json({
      pendingOrders,
      todayOrders,
      todayRevenue: Number((todayRevenueResult._sum.total ?? 0).toFixed(2)),
      lowStockProducts: lowStockCount,
      weekOrders,
      totalCustomers,
      generatedAt: now.toISOString(),
    });
  } catch (e) {
    console.error("[admin/stats] error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
