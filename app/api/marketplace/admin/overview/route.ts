import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

/**
 * GET /api/marketplace/admin/overview
 * Estadísticas agregadas de TODO el marketplace — solo para admin del tenant principal.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalStores,
      activeStores,
      pendingStores,
      todayOrders,
      monthOrders,
      prevMonthOrders,
      pendingOrders,
      totalCommissions,
      topStores,
      recentOrders,
    ] = await Promise.all([
      // Total stores
      prisma.store.count(),
      // Active stores
      prisma.store.count({ where: { isPublished: true } }),
      // Pending approval stores
      prisma.store.count({ where: { isPublished: false } }),
      // Today's orders across ALL stores
      prisma.order.aggregate({
        where: { source: "marketplace", deletedAt: null, createdAt: { gte: todayStart } },
        _count: true,
        _sum: { total: true },
      }),
      // This month's orders
      prisma.order.aggregate({
        where: { source: "marketplace", deletedAt: null, createdAt: { gte: monthStart } },
        _count: true,
        _sum: { total: true },
      }),
      // Previous month (for comparison)
      prisma.order.aggregate({
        where: { source: "marketplace", deletedAt: null, createdAt: { gte: prevMonthStart, lt: monthStart } },
        _count: true,
        _sum: { total: true },
      }),
      // Pending orders across all stores
      prisma.order.count({
        where: { source: "marketplace", deletedAt: null, status: "pendiente" },
      }),
      // Total commissions this month
      prisma.commissionLedger.aggregate({
        where: { createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      // Top 5 stores by revenue this month
      prisma.order.groupBy({
        by: ["tenantId"],
        where: { source: "marketplace", deletedAt: null, createdAt: { gte: monthStart } },
        _sum: { total: true },
        _count: true,
        orderBy: { _sum: { total: "desc" } },
        take: 5,
      }),
      // Recent marketplace orders
      prisma.order.findMany({
        where: { source: "marketplace", deletedAt: null },
        select: {
          id: true,
          customerName: true,
          total: true,
          status: true,
          createdAt: true,
          tenantId: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // Resolve store names for top stores
    const tenantIds = topStores.map((s) => s.tenantId);
    const stores = await prisma.store.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { tenantId: true, name: true, slug: true },
    });
    const storeMap = new Map(stores.map((s) => [s.tenantId, s]));

    // Resolve store names for recent orders
    const orderTenantIds = [...new Set(recentOrders.map((o) => o.tenantId))];
    const orderStores = await prisma.store.findMany({
      where: { tenantId: { in: orderTenantIds } },
      select: { tenantId: true, name: true },
    });
    const orderStoreMap = new Map(orderStores.map((s) => [s.tenantId, s.name]));

    const monthRevenue = monthOrders._sum.total ?? 0;
    const prevMonthRevenue = prevMonthOrders._sum.total ?? 0;
    const revenueGrowth = prevMonthRevenue > 0
      ? Math.round(((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
      : 0;

    return NextResponse.json({
      stores: {
        total: totalStores,
        active: activeStores,
        pending: pendingStores,
      },
      today: {
        orders: todayOrders._count,
        revenue: todayOrders._sum.total ?? 0,
      },
      month: {
        orders: monthOrders._count,
        revenue: monthRevenue,
        revenueGrowth,
      },
      pendingOrders,
      commissions: {
        month: totalCommissions._sum.amount ?? 0,
      },
      topStores: topStores.map((s) => ({
        name: storeMap.get(s.tenantId)?.name ?? "Tienda",
        slug: storeMap.get(s.tenantId)?.slug ?? "",
        orders: s._count,
        revenue: s._sum.total ?? 0,
      })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        customerName: o.customerName,
        total: o.total,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        storeName: orderStoreMap.get(o.tenantId) ?? "Tienda",
      })),
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
