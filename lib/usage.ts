import "server-only";
import { prisma } from "@/lib/prisma";
import { getPlanLimits } from "@/lib/plans";

export interface TenantUsage {
  products: number;
  users: number;
  ordersThisMonth: number;
}

/** Counts current resource usage for a tenant (identified by slug). */
export async function getTenantUsage(tenantSlug: string): Promise<TenantUsage> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [products, users, ordersThisMonth] = await Promise.all([
    prisma.product.count({ where: { tenantId: tenantSlug, active: true } }),
    prisma.adminUser.count({ where: { tenantId: tenantSlug, active: true } }),
    prisma.order.count({ where: { tenantId: tenantSlug, createdAt: { gte: monthStart } } }),
  ]);

  return { products, users, ordersThisMonth };
}

/** Returns usage as a percentage of the plan limit (0-100, or null when unlimited). */
export function usagePct(used: number, max: number): number | null {
  if (max === -1) return null;
  if (max === 0) return 100;
  return Math.min(100, Math.round((used / max) * 100));
}

/** Returns "ok" | "warn" (≥ 80%) | "over" (≥ 100%). */
export function usageStatus(used: number, max: number): "ok" | "warn" | "over" {
  if (max === -1) return "ok";
  if (used >= max) return "over";
  if (used / max >= 0.8) return "warn";
  return "ok";
}

/** Full usage snapshot for a tenant including limits and percentages. */
export async function getTenantUsageSnapshot(tenantSlug: string, plan: string) {
  const limits = getPlanLimits(plan);
  const usage = await getTenantUsage(tenantSlug);
  return {
    usage,
    limits,
    pct: {
      products: usagePct(usage.products, limits.maxProducts),
      users: usagePct(usage.users, limits.maxUsers),
      ordersThisMonth: usagePct(usage.ordersThisMonth, limits.maxOrdersPerMonth),
    },
    status: {
      products: usageStatus(usage.products, limits.maxProducts),
      users: usageStatus(usage.users, limits.maxUsers),
      ordersThisMonth: usageStatus(usage.ordersThisMonth, limits.maxOrdersPerMonth),
    },
  };
}
