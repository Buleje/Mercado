/**
 * lib/cost-tracking.ts
 *
 * Estimates monthly infrastructure cost per tenant.
 * Uses proxy metrics (product count, order volume, AI usage) to approximate
 * real costs. Useful for SaaS margin analysis in the superadmin dashboard.
 *
 * Cost model (simplified estimates):
 *   - Storage: $0.001 per product (DB rows + images)
 *   - Compute: $0.005 per order (API calls + webhooks)
 *   - AI: $0.01 per AI request (LLM calls)
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";

// ── Types ───────────────────────────────────────────────────────────────────

export interface TenantCostEstimate {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  plan: string;
  productCount: number;
  ordersLast30d: number;
  aiRequestsLast30d: number;
  storageCost: number;
  computeCost: number;
  aiCost: number;
  totalCost: number;
  grossMargin: number;
}

// ── Cost constants (USD) ────────────────────────────────────────────────────

const COST_PER_PRODUCT = 0.001; // ~$1 per 1000 products/month
const COST_PER_ORDER = 0.005;   // ~$5 per 1000 orders/month
const COST_PER_AI_REQ = 0.01;   // ~$10 per 1000 AI requests
const BASE_COST = 0.50;         // Fixed per-tenant cost (DNS, cert, etc.)

// Plan revenue (monthly USD)
const PLAN_REVENUE: Record<string, number> = {
  free: 0,
  pro: 29,
  business: 79,
  enterprise: 199,
};

const CACHE_TTL = 600; // 10 min

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Estimate monthly infrastructure cost for a single tenant.
 */
export async function estimateTenantCost(
  tenantId: string,
): Promise<TenantCostEstimate | null> {
  const cacheKey = `cost-tracking:${tenantId}`;

  return getOrSet<TenantCostEstimate | null>(cacheKey, CACHE_TTL, async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true, name: true, plan: true },
    });

    if (!tenant) return null;

    const [productCount, ordersLast30d, aiRequestsLast30d] = await Promise.all([
      prisma.product.count({
        where: { tenantId, deletedAt: null },
      }),
      prisma.order.count({
        where: { tenantId, createdAt: { gte: thirtyDaysAgo }, deletedAt: null },
      }),
      prisma.activityLog.count({
        where: {
          tenantId,
          action: { startsWith: "ai_" },
          createdAt: { gte: thirtyDaysAgo },
        },
      }).catch(() => 0),
    ]);

    const storageCost = Math.round(productCount * COST_PER_PRODUCT * 100) / 100;
    const computeCost = Math.round((ordersLast30d * COST_PER_ORDER + BASE_COST) * 100) / 100;
    const aiCost = Math.round(aiRequestsLast30d * COST_PER_AI_REQ * 100) / 100;
    const totalCost = Math.round((storageCost + computeCost + aiCost) * 100) / 100;

    const revenue = PLAN_REVENUE[tenant.plan] ?? 0;
    const grossMargin = revenue > 0
      ? Math.round(((revenue - totalCost) / revenue) * 100 * 100) / 100
      : 0;

    logger.debug("[cost-tracking] Estimated cost", {
      tenantId,
      totalCost,
      grossMargin,
    });

    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      plan: tenant.plan,
      productCount,
      ordersLast30d,
      aiRequestsLast30d,
      storageCost,
      computeCost,
      aiCost,
      totalCost,
      grossMargin,
    };
  });
}

/**
 * Estimate costs for ALL tenants. Used by the superadmin dashboard.
 */
export async function estimateAllTenantCosts(): Promise<TenantCostEstimate[]> {
  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const results: TenantCostEstimate[] = [];

  for (const tenant of tenants) {
    const cost = await estimateTenantCost(tenant.id);
    if (cost) results.push(cost);
  }

  return results;
}
