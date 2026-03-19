import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prismaReadonly as prisma } from "@/lib/prisma-readonly";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// GET /api/superadmin/analytics
// Returns aggregated platform analytics: revenue, growth, plan distribution, usage
export async function GET(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "GENEROUS", "sa-analytics");
  if (rateLimited) return rateLimited;

  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

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

  // MRR calculation
  const PLAN_PRICES: Record<string, number> = { free: 0, pro: 49, business: 149, enterprise: 399 };
  const mrr = allTenants.reduce((sum, t) => {
    if (!t.active) return sum;
    return sum + (PLAN_PRICES[t.plan] ?? 0);
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
      .reduce((s, t) => s + (PLAN_PRICES[t.plan] ?? 0), 0);
    monthlyRevenue.push({ month: label, revenue });
  }

  return NextResponse.json({
    overview: {
      totalTenants: allTenants.length,
      activeTenants: allTenants.filter((t) => t.active).length,
      payingTenants: allTenants.filter((t) => t.plan !== "free" && t.active).length,
      mrr,
      arr: mrr * 12,
      arpu: allTenants.length > 0 ? Math.round(mrr / allTenants.length) : 0,
    },
    growth: {
      tenantsThisMonth,
      tenantsLastMonth,
      tenantGrowthPct,
      ordersThisMonth,
      ordersLastMonth,
      orderGrowthPct,
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
  });
}
