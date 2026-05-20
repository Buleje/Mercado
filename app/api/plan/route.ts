import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prismaForTenant, findTenantByIdOrSlug } from "@/lib/tenant";
import { getPlanDef, getPlanLimits } from "@/lib/plans";

// GET /api/plan — returns current tenant plan + usage stats
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { tenantId } = auth;
  const db = prismaForTenant(tenantId);

  // Fetch tenant metadata — audit 2026-05-19: migrado a findTenantByIdOrSlug (cacheado).
  const tenant = await findTenantByIdOrSlug(tenantId);
  const plan = tenant?.plan ?? "free";
  const planDef = getPlanDef(plan);
  const limits = getPlanLimits(plan);

  // Start of current month (UTC)
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // Collect usage counts in parallel
  const [productCount, userCount, ordersThisMonth] = await Promise.all([
    db.product.count(),
    db.adminUser.count({ where: { active: true } }),
    db.order.count({ where: { createdAt: { gte: monthStart } } }),
  ]);

  return NextResponse.json({
    plan,
    planDef,
    limits,
    usage: {
      products: productCount,
      users: userCount,
      ordersThisMonth,
    },
    tenant: {
      id: tenant?.id,
      slug: tenant?.slug ?? tenantId,
      name: tenant?.name,
      active: tenant?.active,
      trialEndsAt: tenant?.trialEndsAt,
      customDomain: tenant?.customDomain,
      stripeCustomerId: tenant?.stripeCustomerId ?? null,
    },
  });
}
