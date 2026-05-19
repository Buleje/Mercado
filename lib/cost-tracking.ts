/**
 * lib/cost-tracking.ts
 *
 * Estimates monthly infrastructure cost per tenant.
 * Uses proxy metrics (product count, order volume, AI usage) to approximate
 * real costs. Useful for SaaS margin analysis in the superadmin dashboard.
 *
 * Cost model en PEN (Soles, alineado con plan-tiers.ts):
 *   - Storage: S/ 0.005 por producto (DB rows + imágenes Supabase)
 *   - Compute: S/ 0.02  por orden (API + webhooks Vercel Fluid)
 *   - AI:      S/ 0.04  por request LLM (Gateway + tokens)
 *
 * Audit 2026-05-19 — Business P0 #4: precios actualizados de USD 2022
 * (pro=$29, business=$79) a PEN 2026 (pro=89, business=179, enterprise=349)
 * para que el dashboard de superadmin muestre MRR/márgenes reales.
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

// ── Cost constants (PEN — Soles) ────────────────────────────────────────────

const COST_PER_PRODUCT = 0.005; // ~S/5 per 1000 products/month
const COST_PER_ORDER = 0.02;    // ~S/20 per 1000 orders/month (Vercel + webhooks)
const COST_PER_AI_REQ = 0.04;   // ~S/40 per 1000 AI requests (Gateway + tokens)
const BASE_COST = 2.0;          // Fixed per-tenant cost en PEN (DNS, cert, observabilidad)

// Plan revenue (mensual en PEN — alineado con DEFAULT_PLAN_PRICES en lib/plans.ts)
// Single source of truth: DEFAULT_PLAN_PRICES.
// Mantener este map como fallback estático para evitar circular imports y
// para que el cálculo sea determinístico sin DB hit.
const PLAN_REVENUE: Record<string, number> = {
  free: 0,
  pro: 89,        // Starter
  business: 179,  // Pro
  enterprise: 349, // Business
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
