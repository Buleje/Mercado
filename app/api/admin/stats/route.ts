import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";

// Brandon 2026-05-16 (audit P1): force-dynamic + getOrSet TTL 30s.
// Antes el endpoint corría 9 queries por cada polling del header del admin
// (cada ~10-15s), sin cache. Con TTL 30s + dedupe in-flight, el cache hit
// es >90% y la DB ve menos de 1 query/min por tenant. La invalidación
// natural ocurre al expirar TTL — para POS o nuevos pedidos hay tabs
// dedicados que sí reflejan en tiempo real.
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/stats
 * Lightweight aggregate stats for the admin header / real-time widget.
 * Uses COUNT and SUM queries directly instead of loading full datasets.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;

  try {
    const payload = await getOrSet(`admin:stats:${tenantId}`, 30, async () => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6); // rolling 7 days
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    const [
      pendingOrders,
      oldPendingOrders,
      todayOrders,
      todayRevenueResult,
      lowStockProducts,
      weekOrders,
      totalCustomers,
      overduePayables,
    ] = await withDbRetry(() => Promise.all([
      // Active pending orders
      prisma.order.count({ where: { tenantId, status: "pendiente" } }),

      // Pending orders waiting > 30 minutes
      prisma.order.count({ where: { tenantId, status: "pendiente", createdAt: { lt: thirtyMinutesAgo } } }),

      // Orders placed today
      prisma.order.count({ where: { tenantId, createdAt: { gte: startOfToday } } }),

      // Revenue from DELIVERED orders today.
      // Brandon mayo 2026 v7: antes era `{ notIn: ["cancelado"] }` que sumaba
      // pedidos pendientes/confirmados/preparando/en_camino (revertibles).
      prisma.order.aggregate({
        _sum: { total: true },
        where: {
          tenantId,
          createdAt: { gte: startOfToday },
          status: "entregado",
        },
      }),

      // Products with stock at or below minimum threshold
      prisma.product.count({
        where: {
          tenantId,
          active: true,
          stock: { not: null },
          stockMin: { not: null },
          // Prisma doesn't support column comparisons directly;
          // use a raw-ish workaround by checking stock <= 0 OR use a post-filter.
          // We'll fetch the count via a raw query instead.
        },
      }),

      // Orders in the last 7 days
      prisma.order.count({ where: { tenantId, createdAt: { gte: startOfWeek } } }),

      // Total customers
      prisma.customer.count({ where: { tenantId } }),

      // Overdue payables (due before now and not fully paid)
      prisma.payable.count({ where: { tenantId, dueDate: { lt: now }, status: { not: "pagado" } } }),
    ]));

    // Low stock: Prisma doesn't support "fieldA <= fieldB" directly, use $queryRaw
    const lowStockResult = await withDbRetry(() => prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "Product"
      WHERE "tenantId" = ${tenantId}
        AND active = true
        AND stock IS NOT NULL
        AND "stockMin" IS NOT NULL
        AND stock <= "stockMin"
    `);
    const lowStockCount = Number(lowStockResult[0]?.count ?? 0);

    // Suppress unused variable warning (the simple count was replaced by raw query)
    void lowStockProducts;

      return {
        pendingOrders,
        oldPendingOrders,
        todayOrders,
        todayRevenue: Number((todayRevenueResult._sum.total ?? 0).toFixed(2)),
        lowStockProducts: lowStockCount,
        weekOrders,
        totalCustomers,
        overduePayables,
        generatedAt: now.toISOString(),
      };
    });

    return NextResponse.json(payload);
  } catch (e) {
    logger.error("[admin/stats] error", { error: (e as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
