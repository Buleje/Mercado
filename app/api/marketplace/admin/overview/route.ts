/**
 * @prisma-direct ok — operación con scope explícito por `auth.tenantId` o
 * por `tenantId` resuelto desde slug del URL antes de la query. Aislamiento
 * cross-tenant verificado manualmente. Migrar a clase `lib/db/*.db.ts`
 * dedicada cuando se centralice el patrón.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * GET /api/marketplace/admin/overview
 * Estadísticas agregadas de TODO el marketplace — solo para admin del tenant principal.
 *
 * SECURITY: el `requireAdmin(["admin"])` acepta admin de cualquier tenant.
 * Sin este chequeo extra, cualquier admin de un vendor podía leer revenue
 * y órdenes de TODA la plataforma (cross-tenant data leak masivo).
 */
const PLATFORM_TENANT_ID = "main";

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    if (auth.tenantId !== PLATFORM_TENANT_ID) {
      return NextResponse.json(
        { error: "forbidden", message: "Solo el tenant principal de la plataforma puede acceder al overview global" },
        { status: 403 },
      );
    }

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

    // TD-018: _sum.total es Decimal | null → convertir
    const monthRevenue = toNumOrZero(monthOrders._sum.total);
    const prevMonthRevenue = toNumOrZero(prevMonthOrders._sum.total);
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
        revenue: toNumOrZero(todayOrders._sum.total),
      },
      month: {
        orders: monthOrders._count,
        revenue: monthRevenue,
        revenueGrowth,
      },
      pendingOrders,
      commissions: {
        month: toNumOrZero(totalCommissions._sum.amount),
      },
      topStores: topStores.map((s) => ({
        name: storeMap.get(s.tenantId)?.name ?? "Tienda",
        slug: storeMap.get(s.tenantId)?.slug ?? "",
        orders: s._count,
        revenue: toNumOrZero(s._sum.total),
      })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        customerName: o.customerName,
        total: Number(o.total),
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
