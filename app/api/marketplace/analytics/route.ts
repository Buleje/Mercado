/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 * Migrar a `lib/db/marketplace-*.db.ts` cuando se cree clase específica.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { toNumOrZero } from "@/lib/decimal-utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/analytics
 * Estadísticas detalladas del marketplace para dashboard del vendedor.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const store = await MarketplacePublicDB.getVendorStore(auth.tenantId);

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

    // Run all queries in parallel via DB class
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
    ] = await MarketplacePublicDB.getVendorAnalytics(auth.tenantId, store.id, {
      todayStart,
      monthStart,
      prevMonthStart,
      weekStart,
    });

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
        // TD-018: row._sum.total es Decimal | null
        salesByDay[key].revenue += toNumOrZero(row._sum.total);
        salesByDay[key].orders += row._count;
      }
    }

    const monthRevenue = toNumOrZero(monthOrders._sum.total);
    const prevMonthRevenue = toNumOrZero(prevMonthOrders._sum.total);
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
        // TD-018: rating es Decimal → serializar a number
        rating: toNumOrZero(store.rating),
        reviewCount: store.reviewCount,
      },
      pendingOrders,
      today: {
        orders: todayOrders._count,
        revenue: toNumOrZero(todayOrders._sum.total),
      },
      month: {
        orders: monthOrders._count,
        revenue: monthRevenue,
        avgTicket,
        revenueGrowth,
      },
      week: {
        orders: weekOrders._count,
        revenue: toNumOrZero(weekOrders._sum.total),
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
        // TD-018: p._sum?.price es Decimal | null
        revenue: (p._sum?.quantity ?? 0) * toNumOrZero(p._sum?.price),
      })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        customerName: o.customerName,
        // TD-018: total es Decimal → serializar a number
        total: toNumOrZero(o.total),
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
        today: { orders: allChannelToday._count, revenue: toNumOrZero(allChannelToday._sum.total) },
        month: { orders: allChannelMonth._count, revenue: toNumOrZero(allChannelMonth._sum.total) },
      },
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
