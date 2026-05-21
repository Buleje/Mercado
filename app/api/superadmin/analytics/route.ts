import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prismaReadonly as prisma } from "@/lib/prisma-readonly";
import { applyRateLimit } from "@/lib/rate-limit";
import { getAllPlanPrices } from "@/lib/plans-server";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

/**
 * Lógica completa de analytics platform-wide, cacheada via Next 16 "use cache".
 * Antes: 9 queries Prisma en paralelo + calculos intensivos por request (~5.5s).
 * Ahora: 5 min revalidate, 30s stale OK, 30 min hard expire — analytics
 * platform-wide se renueva con escalas de horas, no minutos. Invalidable
 * con invalidate("superadmin:analytics") tras eventos relevantes.
 */
async function getAnalyticsData(fromISO?: string, toISO?: string) {
  "use cache";
  cacheLife({ revalidate: 300, stale: 30, expire: 1800 });
  cacheTag("superadmin:analytics");

  const now = new Date();
  // Si vienen from/to, usar esos como "periodo actual"; sino fallback al mes en curso.
  const periodStart = fromISO ? new Date(fromISO) : new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = toISO ? new Date(toISO) : now;
  const periodMs = Math.max(periodEnd.getTime() - periodStart.getTime(), 86_400_000);
  // Periodo anterior de misma duración para comparación de growth
  const prevEnd = new Date(periodStart.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - periodMs);

  const PLAN_PRICES = await getAllPlanPrices();

  const [
    allTenants,
    tenantsThisMonth,
    tenantsLastMonth,
    totalOrders,
    ordersThisMonth,
    ordersLastMonth,
    totalProducts,
    totalAdminUsers,
    recentActivity,
  ] = await Promise.all([
    prisma.tenant.findMany({
      select: {
        id: true, slug: true, name: true, plan: true, active: true,
        createdAt: true, cancelAtPeriodEnd: true, trialEndsAt: true,
        stripeCustomerId: true, ownerEmail: true,
      },
    }),
    prisma.tenant.count({ where: { createdAt: { gte: periodStart, lte: periodEnd } } }),
    prisma.tenant.count({ where: { createdAt: { gte: prevStart, lte: prevEnd } } }),
    prisma.order.count(),
    prisma.order.count({ where: { createdAt: { gte: periodStart, lte: periodEnd } } }),
    prisma.order.count({ where: { createdAt: { gte: prevStart, lte: prevEnd } } }),
    prisma.product.count(),
    prisma.adminUser.count(),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, action: true, entity: true, entityId: true,
        detail: true, user: true, tenantId: true, createdAt: true,
      },
    }),
  ]);

  // Plan distribution
  const planCounts: Record<string, number> = { free: 0, pro: 0, business: 0, enterprise: 0 };
  for (const t of allTenants) {
    planCounts[t.plan] = (planCounts[t.plan] ?? 0) + 1;
  }

  // MRR calculation — Brandon 2026-05-21 audit fix #8:
  // antes contaba el precio del plan de TODOS los tenants activos sin
  // importar trial → si los 6 tenants estaban en trial, MRR salía
  // S/1834 cuando el real era S/0 (todavía no pagan). Ahora excluimos
  // tenants cuyo trialEndsAt > now (siguen en trial, plan no se cobra).
  const mrr = allTenants.reduce((sum, t) => {
    if (!t.active) return sum;
    // Si el trial aún no expira, el tenant no paga → no suma a MRR
    if (t.trialEndsAt && new Date(t.trialEndsAt) > now) return sum;
    const price = PLAN_PRICES[t.plan as keyof typeof PLAN_PRICES] ?? 0;
    return sum + price;
  }, 0);

  // Growth metrics
  const tenantGrowthPct = tenantsLastMonth > 0
    ? Math.round(((tenantsThisMonth - tenantsLastMonth) / tenantsLastMonth) * 100)
    : tenantsThisMonth > 0 ? 100 : 0;

  const orderGrowthPct = ordersLastMonth > 0
    ? Math.round(((ordersThisMonth - ordersLastMonth) / ordersLastMonth) * 100)
    : ordersThisMonth > 0 ? 100 : 0;

  // At-risk tenants (canceling or trial expired)
  const atRisk = allTenants.filter(
    (t) => t.cancelAtPeriodEnd || (t.trialEndsAt && new Date(t.trialEndsAt) < now),
  );

  // Monthly signups for the last 6 months (legacy — sigue presente para retro-compat)
  const monthlySignups: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const label = start.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
    const count = allTenants.filter(
      (t) => new Date(t.createdAt) >= start && new Date(t.createdAt) <= end,
    ).length;
    monthlySignups.push({ month: label, count });
  }

  // Monthly revenue (estimated) for the last 6 months (legacy)
  const monthlyRevenue: { month: string; revenue: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const label = end.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
    const revenue = allTenants
      .filter((t) => new Date(t.createdAt) <= end && t.active)
      .reduce(
        (s, t) => s + (PLAN_PRICES[t.plan as keyof typeof PLAN_PRICES] ?? 0),
        0,
      );
    monthlyRevenue.push({ month: label, revenue });
  }

  // Series adaptativas según el rango from/to:
  //  - 0-2 días → hourly (24-48 buckets)
  //  - 3-90 días → daily
  //  - 91-730 días → monthly
  //  - 731+ días → yearly
  const durationDays = Math.max(
    1,
    Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86_400_000),
  );
  const granularity: "hour" | "day" | "month" | "year" =
    durationDays <= 2 ? "hour" : durationDays <= 90 ? "day" : durationDays <= 730 ? "month" : "year";

  const periodSignups: { bucket: string; count: number; iso: string }[] = [];
  const periodRevenue: { bucket: string; revenue: number; iso: string }[] = [];
  const periodOrders: { bucket: string; count: number; iso: string }[] = [];

  // Pre-fetch orders en el rango (para serie de pedidos)
  const ordersInPeriod = await prisma.order.findMany({
    where: { createdAt: { gte: periodStart, lte: periodEnd } },
    select: { id: true, createdAt: true },
  });

  const stepMs = {
    hour: 3_600_000,
    day: 86_400_000,
    month: 0, // calendar-aware
    year: 0, // calendar-aware
  };

  if (granularity === "hour" || granularity === "day") {
    const step = stepMs[granularity];
    for (let t = periodStart.getTime(); t < periodEnd.getTime(); t += step) {
      const bStart = new Date(t);
      const bEnd = new Date(Math.min(t + step - 1, periodEnd.getTime()));
      const label =
        granularity === "hour"
          ? bStart.toLocaleTimeString("es-PE", { hour: "2-digit" })
          : bStart.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
      const iso = bStart.toISOString();
      periodSignups.push({
        bucket: label,
        iso,
        count: allTenants.filter(
          (t2) => new Date(t2.createdAt) >= bStart && new Date(t2.createdAt) <= bEnd,
        ).length,
      });
      periodOrders.push({
        bucket: label,
        iso,
        count: ordersInPeriod.filter(
          (o) => o.createdAt >= bStart && o.createdAt <= bEnd,
        ).length,
      });
      periodRevenue.push({
        bucket: label,
        iso,
        revenue: allTenants
          .filter((t2) => new Date(t2.createdAt) <= bEnd && t2.active)
          .reduce(
            (s, t2) => s + (PLAN_PRICES[t2.plan as keyof typeof PLAN_PRICES] ?? 0),
            0,
          ),
      });
    }
  } else {
    // month / year — calendar-aware buckets
    const startYear = periodStart.getFullYear();
    const startUnit =
      granularity === "month" ? periodStart.getMonth() : periodStart.getFullYear();
    const endYear = periodEnd.getFullYear();
    const endUnit =
      granularity === "month" ? periodEnd.getMonth() : periodEnd.getFullYear();
    const totalUnits =
      granularity === "month"
        ? (endYear - startYear) * 12 + (endUnit - startUnit) + 1
        : endUnit - startUnit + 1;

    for (let i = 0; i < totalUnits; i++) {
      let bStart: Date;
      let bEnd: Date;
      if (granularity === "month") {
        bStart = new Date(startYear, startUnit + i, 1, 0, 0, 0, 0);
        bEnd = new Date(startYear, startUnit + i + 1, 0, 23, 59, 59, 999);
      } else {
        bStart = new Date(startYear + i, 0, 1, 0, 0, 0, 0);
        bEnd = new Date(startYear + i, 11, 31, 23, 59, 59, 999);
      }
      const label =
        granularity === "month"
          ? bStart.toLocaleDateString("es-PE", { month: "short", year: "2-digit" })
          : String(bStart.getFullYear());
      const iso = bStart.toISOString();
      periodSignups.push({
        bucket: label,
        iso,
        count: allTenants.filter(
          (t2) => new Date(t2.createdAt) >= bStart && new Date(t2.createdAt) <= bEnd,
        ).length,
      });
      periodOrders.push({
        bucket: label,
        iso,
        count: ordersInPeriod.filter(
          (o) => o.createdAt >= bStart && o.createdAt <= bEnd,
        ).length,
      });
      periodRevenue.push({
        bucket: label,
        iso,
        revenue: allTenants
          .filter((t2) => new Date(t2.createdAt) <= bEnd && t2.active)
          .reduce(
            (s, t2) => s + (PLAN_PRICES[t2.plan as keyof typeof PLAN_PRICES] ?? 0),
            0,
          ),
      });
    }
  }

  // MRR growth: comparar el último mes vs el anterior usando monthlyRevenue.
  // Antes el dashboard usaba tenantGrowthPct para el MRR — daba "-100%" cuando
  // no había nuevos tenants ese mes, aunque MRR real existiera. Bug fix.
  const currentMrr = monthlyRevenue[monthlyRevenue.length - 1]?.revenue ?? 0;
  const prevMrr = monthlyRevenue[monthlyRevenue.length - 2]?.revenue ?? 0;
  const mrrGrowthPct = prevMrr > 0
    ? Math.round(((currentMrr - prevMrr) / prevMrr) * 100)
    : currentMrr > 0 ? 100 : 0;

  // Churn rate: tenants que cancelaron (cancelAtPeriodEnd o inactive con plan free que antes pagaban)
  // Usamos como proxy: tenants cancelando + tenants inactivos / total tenants
  const cancelingTenants = allTenants.filter((t) => t.cancelAtPeriodEnd).length;
  const inactiveTenants = allTenants.filter((t) => !t.active).length;
  const totalTenants = allTenants.length;
  const churnRate = totalTenants > 0
    ? Math.round(((cancelingTenants + inactiveTenants) / totalTenants) * 100 * 10) / 10
    : 0;

  // Trial conversion rate
  const activeTenants = allTenants.filter((t) => t.active);
  const convertedFromTrial = activeTenants.filter(
    (t) => t.plan !== "free" && t.trialEndsAt,
  ).length;
  const totalTrials = allTenants.filter((t) => t.trialEndsAt).length;
  const trialConversionRate = totalTrials > 0
    ? Math.round((convertedFromTrial / totalTrials) * 100 * 10) / 10
    : 0;

  return {
    overview: {
      totalTenants,
      activeTenants: activeTenants.length,
      inactiveTenants,
      payingTenants: activeTenants.filter((t) => t.plan !== "free").length,
      mrr,
      arr: mrr * 12,
      arpu: totalTenants > 0 ? Math.round(mrr / totalTenants) : 0,
      churnRate,
      trialConversionRate,
      cancelingTenants,
    },
    growth: {
      tenantsThisMonth,
      tenantsLastMonth,
      tenantGrowthPct,
      ordersThisMonth,
      ordersLastMonth,
      orderGrowthPct,
      mrrGrowthPct,
    },
    totals: {
      totalOrders,
      totalProducts,
      totalAdminUsers,
    },
    planDistribution: planCounts,
    atRiskCount: atRisk.length,
    monthlySignups,
    monthlyRevenue,
    // Nuevas series adaptativas según from/to
    period: {
      from: periodStart.toISOString(),
      to: periodEnd.toISOString(),
      granularity,
      durationDays,
      signups: periodSignups,
      revenue: periodRevenue,
      orders: periodOrders,
    },
    recentActivity,
  };
}

// GET /api/superadmin/analytics
// Returns aggregated platform analytics: revenue, growth, plan distribution, usage
export async function GET(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "GENEROUS", "sa-analytics");
  if (rateLimited) return rateLimited;

  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Acepta from/to (YYYY-MM-DD) para filtrar el periodo. Si no vienen, fallback al mes en curso.
  const from = req.nextUrl.searchParams.get("from") ?? undefined;
  const to = req.nextUrl.searchParams.get("to") ?? undefined;
  const data = await getAnalyticsData(from, to);
  // Brandon 2026-05-21 audit blindaje batch 3 perf:
  // Cache-Control private + max-age 60s + stale-while-revalidate 300s.
  // - private: solo browser superadmin del usuario actual lo cachea
  //   (NO CDN/proxy intermedio — datos sensibles)
  // - max-age 60s: refresh suave cada minuto
  // - stale-while-revalidate 300s: si el cache expiró pero el server
  //   tarda, devuelve stale instantáneo y revalida en background
  // Impact: refresh frecuente del dashboard pega cache (analytics es
  // query pesada: findMany tenants + 3 counts + 6 monthly aggregates).
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
    },
  });
}
