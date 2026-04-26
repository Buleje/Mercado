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

const RANGE_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

/**
 * GET /api/superadmin/dashboard/tenant-growth?range=30d&metric=orders
 *
 * Devuelve series por día por tenant para construir un multi-line chart de
 * crecimiento. Filtra al top N tenants por volumen para que el chart se mantenga
 * legible (default top=8).
 *
 * metric=orders → cantidad de órdenes por día por tenant
 * metric=revenue → suma de Order.total por día por tenant
 *
 * Response shape:
 *   {
 *     range: "30d",
 *     metric: "orders",
 *     dates: ["2026-04-01", ...],
 *     series: [{ tenantId, tenantName, slug, plan, color, points: [{date, value}] }]
 *   }
 */
export async function GET(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "GENEROUS", "sa-tenant-growth");
  if (rateLimited) return rateLimited;

  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const range = (url.searchParams.get("range") ?? "30d") as keyof typeof RANGE_DAYS;
  const metric = (url.searchParams.get("metric") ?? "orders") as "orders" | "revenue";
  const days = RANGE_DAYS[range] ?? 30;
  const topN = Math.max(1, Math.min(20, parseInt(url.searchParams.get("top") ?? "8", 10) || 8));

  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - days);
  start.setHours(0, 0, 0, 0);

  // Top N tenants por volumen total en el rango
  const topTenants = await prisma.order.groupBy({
    by: ["tenantId"],
    where: { createdAt: { gte: start }, status: { not: "cancelado" } },
    _sum: { total: true },
    _count: { _all: true },
    orderBy:
      metric === "revenue"
        ? { _sum: { total: "desc" } }
        : { _count: { tenantId: "desc" } },
    take: topN,
  });

  if (topTenants.length === 0) {
    return NextResponse.json({ range, metric, dates: [], series: [] });
  }

  const tenantIds = topTenants.map((t) => t.tenantId);
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, name: true, slug: true, plan: true },
  });
  const byId = new Map(tenants.map((t) => [t.id, t]));

  const orders = await prisma.order.findMany({
    where: {
      tenantId: { in: tenantIds },
      createdAt: { gte: start },
      status: { not: "cancelado" },
    },
    select: { tenantId: true, createdAt: true, total: true },
  });

  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(dayKey(d));
  }

  // Build per-tenant series, default 0 per day.
  const seriesMap = new Map<string, Map<string, number>>();
  for (const tid of tenantIds) {
    const m = new Map<string, number>();
    for (const dt of dates) m.set(dt, 0);
    seriesMap.set(tid, m);
  }
  for (const o of orders) {
    const k = dayKey(o.createdAt);
    const m = seriesMap.get(o.tenantId);
    if (!m || !m.has(k)) continue;
    if (metric === "revenue") {
      m.set(k, (m.get(k) ?? 0) + toNumOrZero(o.total));
    } else {
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }

  // Asignar colores rotando una paleta accesible.
  const PALETTE = ["#00B4A6", "#10B981", "#0EA5E9", "#8B5CF6", "#F59E0B", "#F43F5E", "#84CC16", "#EC4899"];

  const series = topTenants.map((t, i) => {
    const info = byId.get(t.tenantId);
    const m = seriesMap.get(t.tenantId)!;
    const points = dates.map((d) => ({ date: d, value: m.get(d) ?? 0 }));
    return {
      tenantId: t.tenantId,
      tenantName: info?.name ?? "(sin nombre)",
      slug: info?.slug ?? t.tenantId,
      plan: info?.plan ?? "free",
      color: PALETTE[i % PALETTE.length],
      points,
      total:
        metric === "revenue"
          ? toNumOrZero(t._sum.total ?? 0)
          : t._count._all,
    };
  });

  return NextResponse.json(
    { range, metric, dates, series },
    { headers: { "Cache-Control": "private, max-age=120" } },
  );
}
