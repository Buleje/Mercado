/**
 * @cross-tenant intentional — overview global del marketplace.
 * Delegado a MarketplaceAdminDB.getPlatformOverview (ADR-082).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { MarketplaceAdminDB } from "@/lib/db/marketplace-public.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * GET /api/marketplace/admin/overview
 * Estadísticas agregadas de TODO el marketplace — solo para admin del tenant principal.
 *
 * SECURITY: además del requireAdmin, verificamos explícitamente que el
 * tenantId sea "main" para evitar cross-tenant data leak masivo.
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

    const {
      totalStores, activeStores, pendingStores,
      todayOrders, monthOrders, prevMonthOrders, pendingOrders,
      totalCommissions, topStores, recentOrders, storeMap,
    } = await MarketplaceAdminDB.getPlatformOverview();

    const monthRevenue = toNumOrZero(monthOrders._sum.total);
    const prevMonthRevenue = toNumOrZero(prevMonthOrders._sum.total);
    const revenueGrowth = prevMonthRevenue > 0
      ? Math.round(((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
      : 0;

    return NextResponse.json({
      stores: { total: totalStores, active: activeStores, pending: pendingStores },
      today: {
        orders:  todayOrders._count,
        revenue: toNumOrZero(todayOrders._sum.total),
      },
      month: { orders: monthOrders._count, revenue: monthRevenue, revenueGrowth },
      pendingOrders,
      commissions: { month: toNumOrZero(totalCommissions._sum.amount) },
      topStores: topStores.map((s) => ({
        name:    storeMap.get(s.tenantId)?.name ?? "Tienda",
        slug:    storeMap.get(s.tenantId)?.slug ?? "",
        orders:  s._count,
        revenue: toNumOrZero(s._sum.total),
      })),
      recentOrders: recentOrders.map((o) => ({
        id:           o.id,
        customerName: o.customerName,
        total:        Number(o.total),
        status:       o.status,
        createdAt:    o.createdAt.toISOString(),
        storeName:    storeMap.get(o.tenantId)?.name ?? "Tienda",
      })),
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
