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

  // ── Top stores por revenue del mes ─────────────────────────────────────
  const ordersByTenant = await prisma.order.groupBy({
    by: ["tenantId"],
    where: { createdAt: { gte: startOfMonth }, status: { not: "cancelado" } },
    _sum: { total: true },
    _count: { _all: true },
    orderBy: { _sum: { total: "desc" } },
    take: 5,
  });

  const tenantIds = ordersByTenant.map((t) => t.tenantId);
  const tenantInfos = tenantIds.length
    ? await prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true, slug: true, plan: true },
      })
    : [];
  const tenantById = new Map(tenantInfos.map((t) => [t.id, t]));

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

  // ── Funnel: tenants → con productos → con pedidos → con pedidos completados ──
  const totalTenants = await prisma.tenant.count({ where: { active: true } });
  const tenantsWithProducts = await prisma.product.findMany({
    where: { deletedAt: null, active: true },
    distinct: ["tenantId"],
    select: { tenantId: true },
  });
  const tenantsWithOrders = await prisma.order.findMany({
    distinct: ["tenantId"],
    select: { tenantId: true },
  });
  const tenantsWithCompleted = await prisma.order.findMany({
    where: { status: "entregado" },
    distinct: ["tenantId"],
    select: { tenantId: true },
  });

  const funnel = [
    { label: "Tiendas activas", value: totalTenants },
    { label: "Con productos", value: tenantsWithProducts.length },
    { label: "Con pedidos", value: tenantsWithOrders.length },
    { label: "Con entregas exitosas", value: tenantsWithCompleted.length },
  ];

  // ── Latest active: últimos 8 tenants con orden reciente ─────────────────
  const recentOrders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { tenantId: true, createdAt: true, total: true },
  });
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
  const latestTenantInfos = latestTenantIds.length
    ? await prisma.tenant.findMany({
        where: { id: { in: latestTenantIds } },
        select: { id: true, name: true, slug: true, plan: true },
      })
    : [];
  const latestById = new Map(latestTenantInfos.map((t) => [t.id, t]));
  const latestActive = latestTenantIds.map((id) => {
    const info = latestById.get(id);
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

  // ── Revenue series: últimos 30 días ─────────────────────────────────────
  const ordersLast30 = await prisma.order.findMany({
    where: { createdAt: { gte: last30Start }, status: { not: "cancelado" } },
    select: { createdAt: true, total: true },
  });
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

  // ── ARPU series: últimos 6 meses ────────────────────────────────────────
  // ARPU = revenue del mes / paying tenants del mes. Calculamos por mes
  // mirando los Orders del rango y los Tenants con plan != "free" creados
  // hasta fin de ese mes.
  const arpuSeries: Array<{ month: string; arpu: number }> = [];
  const monthFmt = new Intl.DateTimeFormat("es-PE", { month: "short" });
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const [orderSum, payingCount] = await Promise.all([
      prisma.order.aggregate({
        where: {
          createdAt: { gte: monthStart, lt: nextMonthStart },
          status: { not: "cancelado" },
        },
        _sum: { total: true },
      }),
      prisma.tenant.count({
        where: {
          active: true,
          plan: { not: "free" },
          createdAt: { lt: nextMonthStart },
        },
      }),
    ]);
    const total = toNumOrZero(orderSum._sum.total ?? 0);
    const arpu = payingCount > 0 ? total / payingCount : 0;
    arpuSeries.push({
      month: monthFmt.format(monthStart),
      arpu: Math.round(arpu * 100) / 100,
    });
  }

  return NextResponse.json(
    { topStores, funnel, latestActive, revenueSeries, ordersSeries, arpuSeries },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
