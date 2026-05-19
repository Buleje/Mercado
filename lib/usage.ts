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

  // Resolve tenant CUID — products/orders may use slug OR cuid as tenantId
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });
  const tenantIds = tenant
    ? [tenantSlug, tenant.id].filter((v, i, a) => a.indexOf(v) === i) // dedupe if slug === id
    : [tenantSlug];

  const [products, users, ordersThisMonth] = await Promise.all([
    prisma.product.count({ where: { tenantId: { in: tenantIds }, active: true } }),
    prisma.adminUser.count({ where: { tenantId: { in: tenantIds }, active: true } }),
    prisma.order.count({ where: { tenantId: { in: tenantIds }, createdAt: { gte: monthStart } } }),
  ]);

  return { products, users, ordersThisMonth };
}

/**
 * batchTenantUsage — versión escalable de `getTenantUsage` para N tenants.
 *
 * Audit performance 2026-05-19 (#1 bottleneck): `getTenantUsage(slug)` hace
 * 4 queries Prisma (1 findUnique + 3 count). Con fan-out via `Promise.all`
 * en `tenants/route.ts`, esto generaba `4 × N` queries. Con N=1000 tenants
 * → 4000 queries simultáneas → pool exhaustion en Supabase (60 conn max).
 *
 * Esta versión hace **3 `groupBy` totales** independientes del número de
 * tenants. Patrón ya probado en `health/route.ts`.
 *
 * Performance:
 *   • 6 tenants  (hoy): 4 queries (1 SELECT id + 3 groupBy) vs 24 antes
 *   • 100 tenants:      4 queries vs 400 antes
 *   • 1000 tenants:     4 queries vs 4000 antes
 *
 * Crítico: tenantId en Product/AdminUser/Order puede ser slug O cuid según
 * el origen del dato. Devolvemos counts indexados por TODOS los IDs posibles
 * y el caller decide cuál usar (mismo trick que el route).
 *
 * @param tenants Array de `{ slug, id }` — id viene del select del findMany
 *                de Tenant para evitar otro round-trip.
 * @returns Map<key, TenantUsage> donde key puede ser slug o cuid del tenant.
 */
export async function batchTenantUsage(
  tenants: Array<{ slug: string; id: string }>,
): Promise<Map<string, TenantUsage>> {
  if (tenants.length === 0) return new Map();

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // Construir el set de todos los IDs posibles (slugs + cuids) para WHERE IN.
  const allIds = Array.from(
    new Set(tenants.flatMap((t) => [t.slug, t.id]).filter(Boolean)),
  );

  // 3 groupBy paralelos — independientes del tamaño de `tenants`.
  const [productCounts, userCounts, orderCounts] = await Promise.all([
    prisma.product.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: allIds }, active: true, deletedAt: null },
      _count: { _all: true },
    }).catch(() => [] as Array<{ tenantId: string; _count: { _all: number } }>),
    prisma.adminUser.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: allIds }, active: true },
      _count: { _all: true },
    }).catch(() => [] as Array<{ tenantId: string; _count: { _all: number } }>),
    prisma.order.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: allIds }, createdAt: { gte: monthStart } },
      _count: { _all: true },
    }).catch(() => [] as Array<{ tenantId: string; _count: { _all: number } }>),
  ]);

  // Indexar por tenantId (puede ser slug o cuid según el modelo)
  const productMap = new Map(productCounts.map((r) => [r.tenantId, r._count._all]));
  const userMap = new Map(userCounts.map((r) => [r.tenantId, r._count._all]));
  const orderMap = new Map(orderCounts.map((r) => [r.tenantId, r._count._all]));

  // Construir Map<key, TenantUsage> donde key es el slug del tenant.
  // Sumamos counts indexados por slug Y cuid para cubrir ambas convenciones.
  const result = new Map<string, TenantUsage>();
  for (const t of tenants) {
    const products = (productMap.get(t.slug) ?? 0) + (productMap.get(t.id) ?? 0);
    const users = (userMap.get(t.slug) ?? 0) + (userMap.get(t.id) ?? 0);
    const ordersThisMonth = (orderMap.get(t.slug) ?? 0) + (orderMap.get(t.id) ?? 0);
    const usage: TenantUsage = { products, users, ordersThisMonth };
    // Indexar por ambos para que el caller pueda buscar como prefiera
    result.set(t.slug, usage);
    result.set(t.id, usage);
  }
  return result;
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
