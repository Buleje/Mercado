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
async function getAnalyticsData() {
  "use cache";
  cacheLife({ revalidate: 300, stale: 30, expire: 1800 });
  cacheTag("superadmin:analytics");

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

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
    prisma.tenant.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.tenant.count({ where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } } }),
    prisma.order.count(),
    prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.order.count({ where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } } }),
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

  // MRR calculation — usa PLAN_PRICES traídos de PlatformSetting arriba.
  const mrr = allTenants.reduce((sum, t) => {
    if (!t.active) return sum;
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

  // Monthly signups for the last 6 months
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

  // Monthly revenue (estimated) for the last 6 months
  const monthlyRevenue: { month: string; revenue: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const label = end.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
    // Estimate by counting active paid tenants created before end of month
    const revenue = allTenants
      .filter((t) => new Date(t.createdAt) <= end && t.active)
      .reduce(
        (s, t) => s + (PLAN_PRICES[t.plan as keyof typeof PLAN_PRICES] ?? 0),
        0,
      );
    monthlyRevenue.push({ month: label, revenue });
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

  const data = await getAnalyticsData();
  return NextResponse.json(data);
}
