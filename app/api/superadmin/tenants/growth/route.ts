import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prismaReadonly as prisma } from "@/lib/prisma-readonly";
import { applyRateLimit } from "@/lib/rate-limit";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// GET /api/superadmin/tenants/growth
// Returns monthly revenue, orders, and product growth for each tenant (last 6 months)
export async function GET(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "GENEROUS", "sa-growth");
  if (rateLimited) return rateLimited;

  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // Get active tenants
  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    select: { id: true, slug: true, name: true, plan: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  // Monthly orders & revenue per tenant (last 6 months)
  const monthlyOrders = await prisma.order.groupBy({
    by: ["tenantId", "createdAt"],
    _sum: { total: true },
    _count: { _all: true },
    where: {
      createdAt: { gte: sixMonthsAgo },
      status: { notIn: ["cancelado"] },
    },
  });

  // Build monthly buckets per tenant
  const tenantGrowth: Record<string, {
    slug: string;
    name: string;
    plan: string;
    createdAt: string;
    months: Array<{ month: string; revenue: number; orders: number }>;
    totalRevenue: number;
    totalOrders: number;
    growthPct: number;
  }> = {};

  // Initialize months for each tenant
  for (const tenant of tenants) {
    const months: Array<{ month: string; revenue: number; orders: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        month: d.toLocaleDateString("es-PE", { month: "short", year: "2-digit" }),
        revenue: 0,
        orders: 0,
      });
    }
    // Key by slug because Order.tenantId uses slug, not Tenant.id
    tenantGrowth[tenant.slug] = {
      slug: tenant.slug,
      name: tenant.name,
      plan: tenant.plan as string,
      createdAt: tenant.createdAt.toISOString(),
      months,
      totalRevenue: 0,
      totalOrders: 0,
      growthPct: 0,
    };
  }

  // Fill in monthly data
  for (const row of monthlyOrders) {
    const entry = tenantGrowth[row.tenantId];
    if (!entry) continue;
    const d = new Date(row.createdAt);
    const monthKey = d.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
    const monthBucket = entry.months.find((m) => m.month === monthKey);
    if (monthBucket) {
      monthBucket.revenue += Number(row._sum?.total ?? 0);
      monthBucket.orders += row._count?._all ?? 0;
    }
    entry.totalRevenue += Number(row._sum?.total ?? 0);
    entry.totalOrders += row._count?._all ?? 0;
  }

  // Calculate growth % (last month vs month before)
  for (const entry of Object.values(tenantGrowth)) {
    const len = entry.months.length;
    if (len >= 2) {
      const prev = entry.months[len - 2]?.revenue ?? 0;
      const curr = entry.months[len - 1]?.revenue ?? 0;
      entry.growthPct = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0;
    }
  }

  // Sort by total revenue descending
  const sorted = Object.values(tenantGrowth)
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  return NextResponse.json({ data: sorted });
}
