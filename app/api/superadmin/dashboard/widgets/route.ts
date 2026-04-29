import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prismaReadonly as prisma } from "@/lib/prisma-readonly";
import { applyRateLimit } from "@/lib/rate-limit";
import { toNumOrZero } from "@/lib/decimal-utils";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

/**
 * GET /api/superadmin/dashboard/widgets
 *
 * Devuelve datos REALES de la DB para los widgets del dashboard ejecutivo:
 *   - topStores: top 5 tenants por revenue del mes en curso
 *   - funnel: tenants/orders/completed/repeat customers
 *   - latestActive: últimos 8 tenants con actividad reciente
 *   - revenueSeries: ingresos por día últimos 30 días
 *   - ordersSeries: pedidos por día últimos 30 días
 *
 * Reemplaza los mocks de lib/mocks/superadmin-dashboard.mock.ts.
 */
export async function GET(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "GENEROUS", "sa-dashboard-widgets");
  if (rateLimited) return rateLimited;

  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const last30Start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  const monthFmt = new Intl.DateTimeFormat("es-PE", { month: "short" });

  // Pre-compute month windows para ARPU (últimos 6 meses)
  const arpuWindows = Array.from({ length: 6 }, (_, idx) => {
    const i = 5 - idx;
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    return { monthStart, nextMonthStart };
  });

  // ── Phase 1: todas las queries independientes en paralelo ───────────────
  const [
    ordersByTenant,
    totalTenants,
    tenantsWithProducts,
    tenantsWithOrders,
    tenantsWithCompleted,
    recentOrders,
    ordersLast30,
    arpuMonthly,
  ] = await Promise.all([
    prisma.order.groupBy({
      by: ["tenantId"],
      where: { createdAt: { gte: startOfMonth }, status: { not: "cancelado" } },
      _sum: { total: true },
      _count: { _all: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),
    prisma.tenant.count({ where: { active: true } }),
    prisma.product.findMany({
      where: { deletedAt: null, active: true },
      distinct: ["tenantId"],
      select: { tenantId: true },
    }),
    prisma.order.findMany({
      distinct: ["tenantId"],
      select: { tenantId: true },
    }),
    prisma.order.findMany({
      where: { status: "entregado" },
      distinct: ["tenantId"],
      select: { tenantId: true },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { tenantId: true, createdAt: true, total: true },
    }),
    prisma.order.findMany({
      where: { createdAt: { gte: last30Start }, status: { not: "cancelado" } },
      select: { createdAt: true, total: true },
    }),
    Promise.all(
      arpuWindows.map(({ monthStart, nextMonthStart }) =>
        Promise.all([
          prisma.order.aggregate({
            where: {
              createdAt: { gte: monthStart, lt: nextMonthStart },
              status: { not: "cancelado" },
            },
            _sum: { total: true },
          }),
          prisma.tenant.count({
            where: { active: true, plan: { not: "free" }, createdAt: { lt: nextMonthStart } },
          }),
        ]),
      ),
    ),
  ]);

  // ── Phase 2: queries que dependen de Phase 1 ───────────────────────────
  const topStoreIds = ordersByTenant.map((t) => t.tenantId);
  const seen = new Set<string>();
  const latestTenantIds: string[] = [];
  const lastOrderByTenant = new Map<string, { createdAt: Date; total: number }>();
  for (const o of recentOrders) {
    if (!seen.has(o.tenantId)) {
      seen.add(o.tenantId);
      latestTenantIds.push(o.tenantId);
      lastOrderByTenant.set(o.tenantId, {
        createdAt: o.createdAt,
        total: toNumOrZero(o.total),
      });
    }
    if (latestTenantIds.length >= 8) break;
  }

  // Una sola query consolidada para info de tenants (top + latest)
  const allInfoIds = Array.from(new Set([...topStoreIds, ...latestTenantIds]));
  const tenantInfos = allInfoIds.length
    ? await prisma.tenant.findMany({
        where: { id: { in: allInfoIds } },
        select: { id: true, name: true, slug: true, plan: true },
      })
    : [];
  const tenantById = new Map(tenantInfos.map((t) => [t.id, t]));

  // ── Build payloads ──────────────────────────────────────────────────────
  const topStores = ordersByTenant.map((row) => {
    const t = tenantById.get(row.tenantId);
    return {
      tenantId: row.tenantId,
      name: t?.name ?? "(sin nombre)",
      slug: t?.slug ?? row.tenantId,
      plan: t?.plan ?? "free",
      revenue: toNumOrZero(row._sum.total ?? 0),
      orders: row._count._all,
    };
  });

  const funnel = [
    { label: "Tiendas activas", value: totalTenants },
    { label: "Con productos", value: tenantsWithProducts.length },
    { label: "Con pedidos", value: tenantsWithOrders.length },
    { label: "Con entregas exitosas", value: tenantsWithCompleted.length },
  ];

  const latestActive = latestTenantIds.map((id) => {
    const info = tenantById.get(id);
    const last = lastOrderByTenant.get(id);
    return {
      id,
      name: info?.name ?? "(sin nombre)",
      slug: info?.slug ?? id,
      plan: info?.plan ?? "free",
      lastOrderAt: last?.createdAt.toISOString() ?? null,
      lastOrderTotal: last?.total ?? 0,
    };
  });

  // Series últimos 30 días
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const revenueByDay = new Map<string, number>();
  const ordersByDay = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(last30Start);
    d.setDate(last30Start.getDate() + i);
    revenueByDay.set(dayKey(d), 0);
    ordersByDay.set(dayKey(d), 0);
  }
  for (const o of ordersLast30) {
    const k = dayKey(o.createdAt);
    if (revenueByDay.has(k)) {
      revenueByDay.set(k, (revenueByDay.get(k) ?? 0) + toNumOrZero(o.total));
      ordersByDay.set(k, (ordersByDay.get(k) ?? 0) + 1);
    }
  }
  const revenueSeries = Array.from(revenueByDay.entries()).map(([date, revenue]) => ({
    date,
    revenue,
  }));
  const ordersSeries = Array.from(ordersByDay.entries()).map(([date, count]) => ({
    date,
    count,
  }));

  // ARPU desde los pares pre-resueltos en paralelo
  const arpuSeries = arpuWindows.map(({ monthStart }, idx) => {
    const [orderSum, payingCount] = arpuMonthly[idx];
    const total = toNumOrZero(orderSum._sum.total ?? 0);
    const arpu = payingCount > 0 ? total / payingCount : 0;
    return {
      month: monthFmt.format(monthStart),
      arpu: Math.round(arpu * 100) / 100,
    };
  });

  return NextResponse.json(
    { topStores, funnel, latestActive, revenueSeries, ordersSeries, arpuSeries },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
