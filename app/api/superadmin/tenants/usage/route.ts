import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { USAGE_TIERS, type TierName } from "@/lib/billing/wire-up/usage-tiers";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/tenants/usage
 *
 * Uso vs límites del plan por tienda (ADR — gestión de tiendas, 2026-06-14).
 * Calcula desde datos reales: pedidos del mes (vs límite order.created del
 * tier), productos y usuarios admin. Marca candidatas a upsell (≥ alertAt).
 */

// Tenant.plan ∈ {free, pro, business, enterprise} → tier de límites.
function planToTier(plan: string): TierName {
  if (plan === "pro" || plan === "business") return "pro";
  if (plan === "enterprise") return "enterprise";
  if (plan === "starter") return "starter";
  return "free";
}

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [tenants, ordersByTenant, productsByTenant, adminsByTenant] = await Promise.all([
      prisma.tenant.findMany({ select: { id: true, slug: true, name: true, plan: true } }),
      prisma.order.groupBy({ by: ["tenantId"], where: { createdAt: { gte: monthStart } }, _count: { _all: true } }),
      prisma.product.groupBy({ by: ["tenantId"], _count: { _all: true } }),
      prisma.adminUser.groupBy({ by: ["tenantId"], where: { active: true }, _count: { _all: true } }),
    ]);

    const orderMap = new Map(ordersByTenant.map((r) => [r.tenantId, r._count._all]));
    const productMap = new Map(productsByTenant.map((r) => [r.tenantId, r._count._all]));
    const adminMap = new Map(adminsByTenant.map((r) => [r.tenantId, r._count._all]));

    const rows = tenants.map((t) => {
      const tier = planToTier(t.plan);
      const quota = USAGE_TIERS[tier]["order.created"];
      const orderLimit = quota?.limit ?? Infinity;
      const alertAt = quota?.alertAt ?? 0.9;
      const ordersThisMonth = orderMap.get(t.id) ?? 0;
      const pct = orderLimit === Infinity || orderLimit === 0 ? 0 : ordersThisMonth / orderLimit;
      return {
        slug: t.slug,
        name: t.name,
        plan: t.plan,
        tier,
        ordersThisMonth,
        orderLimit: orderLimit === Infinity ? null : orderLimit,
        orderPct: Math.round(pct * 100),
        nearLimit: orderLimit !== Infinity && pct >= alertAt,
        products: productMap.get(t.id) ?? 0,
        adminUsers: adminMap.get(t.id) ?? 0,
      };
    });

    // Upsell candidates primero (cerca del límite), luego por uso desc.
    rows.sort((a, b) => Number(b.nearLimit) - Number(a.nearLimit) || b.orderPct - a.orderPct);

    return NextResponse.json({ rows, generatedAt: now.toISOString() });
  } catch (e) {
    logger.error("[tenants/usage] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
