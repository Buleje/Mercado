import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prismaForTenant, findTenantByIdOrSlug } from "@/lib/tenant";
import { getPlanDef, getPlanLimits } from "@/lib/plans";
import { logger } from "@/lib/logger";

// GET /api/plan — returns current tenant plan + usage stats
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { tenantId } = auth;

    // Fetch tenant metadata — audit 2026-05-19: migrado a findTenantByIdOrSlug (cacheado).
    const tenant = await findTenantByIdOrSlug(tenantId);
    const plan = tenant?.plan ?? "free";

    // Fast path: `?tier=1` devuelve SOLO el plan (lookup de tenant cacheado),
    // sin las 3 COUNT queries de uso. Lo usa usePlanTier() en cada componente
    // del admin — antes pedía /api/plan completo 5× por carga (3 counts c/u
    // tirados a la basura). Perf 2026-05-29.
    if (new URL(req.url).searchParams.get("tier") === "1") {
      return NextResponse.json({ plan });
    }

    const db = prismaForTenant(tenantId);
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

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
