import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

/**
 * GET /api/marketplace/analytics
 * Estadísticas detalladas del marketplace para dashboard del vendedor.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const store = await prisma.store.findFirst({
      where: { tenantId: auth.tenantId },
      select: { id: true, name: true, slug: true, rating: true, reviewCount: true, createdAt: true },
    });

    if (!store) {
      return NextResponse.json({
        store: { name: "", slug: "", rating: 0, reviewCount: 0 },
        today: { orders: 0, revenue: 0 },
        month: { orders: 0, revenue: 0, avgTicket: 0, revenueGrowth: 0 },
        week: { orders: 0, revenue: 0 },
        products: { published: 0, total: 0, lowStock: 0 },
        pendingOrders: 0,
        pendingReviews: 0,
        topProducts: [],
        recentOrders: [],
        dailySales: [],
      });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    // Run all queries in parallel
    const [
      todayOrders,
      monthOrders,
      prevMonthOrders,
      weekOrders,
      publishedProducts,
      totalProducts,
      lowStockProducts,
      pendingOrders,
      pendingReviews,
      topProducts,
      recentOrders,
      dailySales,
      allChannelToday,
      allChannelMonth,
    ] = await Promise.all([
      // Today's orders
      prisma.order.aggregate({
        where: { tenantId: auth.tenantId, source: "marketplace", deletedAt: null, createdAt: { gte: todayStart } },
        _count: true,
        _sum: { total: true },
      }),
      // This month's orders
      prisma.order.aggregate({
        where: { tenantId: auth.tenantId, source: "marketplace", deletedAt: null, createdAt: { gte: monthStart } },
        _count: true,
        _sum: { total: true },
      }),
      // Previous month's orders (for comparison)
      prisma.order.aggregate({
        where: { tenantId: auth.tenantId, source: "marketplace", deletedAt: null, createdAt: { gte: prevMonthStart, lt: monthStart } },
        _count: true,
        _sum: { total: true },
      }),
      // Last 7 days orders
      prisma.order.aggregate({
        where: { tenantId: auth.tenantId, source: "marketplace", deletedAt: null, createdAt: { gte: weekStart } },
        _count: true,
        _sum: { total: true },
      }),
      // Published products
      prisma.storeProduct.count({ where: { storeId: store.id, isActive: true } }),
      // Total products
      prisma.storeProduct.count({ where: { storeId: store.id } }),
      // Low stock products (stock <= 5)
      prisma.storeProduct.count({
        where: {
          storeId: store.id,
          isActive: true,
          product: { stock: { lte: 5 } },
        },
      }),
      // Pending orders (pendiente status)
      prisma.order.count({
        where: { tenantId: auth.tenantId, source: "marketplace", deletedAt: null, status: "pendiente" },
      }),
      // Pending reviews
      prisma.review.count({ where: { storeId: store.id, status: "pending" } }),
      // Top 5 products by orders
      prisma.orderItem.groupBy({
        by: ["name"],
        where: {
          order: {
            tenantId: auth.tenantId,
            source: "marketplace",
            deletedAt: null,
            createdAt: { gte: monthStart },
          },
        },
        _sum: { quantity: true, price: true },
        orderBy: { _sum: { price: "desc" } },
        take: 5,
      }),
      // Recent 5 orders
      prisma.order.findMany({
        where: { tenantId: auth.tenantId, source: "marketplace", deletedAt: null },
        select: {
          id: true,
          customerName: true,
          total: true,
          status: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      // Daily sales last 7 days
      prisma.order.groupBy({
        by: ["createdAt"],
        where: {
          tenantId: auth.tenantId,
          source: "marketplace",
          deletedAt: null,
          createdAt: { gte: weekStart },
        },
        _sum: { total: true },
        _count: true,
      }),
      // All-channel today (marketplace + direct + POS)
      prisma.order.aggregate({
        where: { tenantId: auth.tenantId, deletedAt: null, createdAt: { gte: todayStart } },
        _count: true,
        _sum: { total: true },
      }),
      // All-channel this month
      prisma.order.aggregate({
        where: { tenantId: auth.tenantId, deletedAt: null, createdAt: { gte: monthStart } },
        _count: true,
        _sum: { total: true },
      }),
    ]);

    // Aggregate daily sales into day buckets
    const salesByDay: Record<string, { revenue: number; orders: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      salesByDay[key] = { revenue: 0, orders: 0 };
    }
    for (const row of dailySales) {
      const key = new Date(row.createdAt).toISOString().slice(0, 10);
      if (salesByDay[key]) {
        salesByDay[key].revenue += row._sum.total ?? 0;
        salesByDay[key].orders += row._count;
      }
    }

    const monthRevenue = monthOrders._sum.total ?? 0;
    const prevMonthRevenue = prevMonthOrders._sum.total ?? 0;
    const revenueGrowth = prevMonthRevenue > 0
      ? Math.round(((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
      : 0;

    const avgTicket = monthOrders._count > 0
      ? Math.round((monthRevenue / monthOrders._count) * 100) / 100
      : 0;

    return NextResponse.json({
      store: {
        name: store.name,
        slug: store.slug ?? "",
        rating: store.rating,
        reviewCount: store.reviewCount,
      },
      pendingOrders,
      today: {
        orders: todayOrders._count,
        revenue: todayOrders._sum.total ?? 0,
      },
      month: {
        orders: monthOrders._count,
        revenue: monthRevenue,
        avgTicket,
        revenueGrowth,
      },
      week: {
        orders: weekOrders._count,
        revenue: weekOrders._sum.total ?? 0,
      },
      products: {
        published: publishedProducts,
        total: totalProducts,
        lowStock: lowStockProducts,
      },
      pendingReviews,
      topProducts: topProducts.map((p) => ({
        name: p.name,
        qty: p._sum?.quantity ?? 0,
        revenue: (p._sum?.quantity ?? 0) * (p._sum?.price ?? 0),
      })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        customerName: o.customerName,
        total: o.total,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        itemsCount: o._count.items,
      })),
      dailySales: Object.entries(salesByDay).map(([date, v]) => ({
        date,
        revenue: v.revenue,
        orders: v.orders,
      })),
      allChannels: {
        today: { orders: allChannelToday._count, revenue: allChannelToday._sum.total ?? 0 },
        month: { orders: allChannelMonth._count, revenue: allChannelMonth._sum.total ?? 0 },
      },
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
