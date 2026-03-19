import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { getTenantUsage } from "@/lib/usage";
import { getPlanLimits } from "@/lib/plans";

export const dynamic = "force-dynamic";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// GET /api/superadmin/tenants
// Returns all tenants with plan, billing, and user count
export async function GET(req: NextRequest) {
  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [tenants, userCounts] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        name: true,
        active: true,
        plan: true,
        trialEndsAt: true,
        createdAt: true,
        ownerEmail: true,
        customDomain: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripePriceId: true,
        stripeCurrentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
    }),
    prisma.adminUser.groupBy({ by: ["tenantId"], _count: { id: true } }),
  ]);

  const countMap = Object.fromEntries(userCounts.map((r) => [r.tenantId, r._count.id]));

  // Fetch usage for all tenants in parallel (capped at 50 concurrent)
  const usageList = await Promise.all(
    tenants.map((t) => getTenantUsage(t.slug))
  );

  const rows = tenants.map((t, i) => {
    const usage = usageList[i];
    const limits = getPlanLimits(t.plan);
    return {
      ...t,
      _count: { AdminUser: countMap[t.slug] ?? 0 },
      usage,
      limits: {
        maxProducts: limits.maxProducts,
        maxUsers: limits.maxUsers,
        maxOrdersPerMonth: limits.maxOrdersPerMonth,
      },
    };
  });

  return NextResponse.json({ tenants: rows });
}
