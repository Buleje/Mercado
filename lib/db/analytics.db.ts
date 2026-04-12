import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * lib/db/analytics.db.ts
 *
 * Read-only analytics aggregates for the admin dashboard. Every method takes
 * `tenantId` as the first parameter (multi-tenant isolation is mandatory —
 * rule #3 in CLAUDE.md).
 *
 * All aggregation runs inside Prisma (`_sum`, `_count`, `groupBy`) so the
 * database does the heavy lifting and the payload stays tiny. No raw rows
 * leave this file — only the pre-aggregated numbers.
 *
 * Each public method is an async function that uses the Next 16 `"use cache"`
 * directive with `cacheLife` + `cacheTag` for surgical invalidation. The
 * tenantId is part of the function arguments, so it is automatically included
 * in the cache key — different tenants never share a cached result.
 *
 * To invalidate after a write, call `revalidateTag("tenant:${tenantId}:dashboard")`
 * from the mutating path (orders create, product stock update, etc.).
 *
 * See: docs/adr/019-next16-cache-components-no-force-dynamic.md
 */

// ── Response shape ───────────────────────────────────────────────────────────

export interface DashboardAggregates {
  /** Tenant the aggregates belong to. Echoed for debugging + invalidation. */
  tenantId: string;
  /** Today's completed sales — count of orders and sum of revenue. */
  today: {
    salesCount: number;
    revenue: number;
  };
  /** Last 7 days rolling window, completed orders only. */
  week: {
    salesCount: number;
    revenue: number;
  };
  /** Orders currently in flight: status `pendiente` or `confirmado`. */
  activeCarts: number;
  /** Products with stock at or below stockMin (only counts rows where stockMin is set). */
  lowStockCount: number;
  /** Abandoned carts in the last 24h — count and estimated value. */
  abandonedCarts: {
    count: number;
    estimatedValue: number;
  };
  /** ISO timestamp of when the aggregates were computed. */
  generatedAt: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Order statuses that count as "completed revenue" for dashboard KPIs. */
const COMPLETED_STATUSES = ["entregado", "confirmado", "en_camino"] as const;

/** Order statuses that count as "active cart in flight". */
const ACTIVE_CART_STATUSES = ["pendiente", "confirmado"] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfLastWeek(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

// ── AnalyticsDB ──────────────────────────────────────────────────────────────

export const AnalyticsDB = {
  /**
   * Return pre-aggregated KPIs for the admin dashboard of a single tenant.
   *
   * Cache behavior (Next 16 Cache Components):
   * - `revalidate: 60` — stale after one minute, background refresh
   * - `stale:       30` — serve stale for up to 30 s while revalidating
   * - `expire:     300` — hard TTL, evict after 5 min
   * - tag `tenant:${tenantId}:dashboard` — surgical invalidation from writes
   *
   * Error propagation (HOTFIX-006):
   * This function intentionally has NO try/catch around the Prisma calls.
   * Next 16 Cache Components only cache SUCCESSFUL resolutions of a
   * `"use cache"` function — thrown errors are NOT cached. If we were to
   * catch a transient DB failure and return an all-zero fallback, Next would
   * happily store those zeros under `tenant:${tenantId}:dashboard` for up to
   * `expire:300` seconds, blinding the dashboard for 5 minutes after the DB
   * has recovered. Letting the error bubble keeps the cache clean; the route
   * handler at `app/api/admin/dashboard/aggregates/route.ts` owns the
   * HTTP 500 response so the client sees a real error and can retry.
   *
   * @param tenantId — tenant scope. MANDATORY first argument per rule #3.
   * @throws propagates any Prisma error. Do NOT wrap this call in a catch
   *   that swallows the error and returns a placeholder — it will be cached.
   */
  async getDashboardAggregates(tenantId: string): Promise<DashboardAggregates> {
    "use cache";
    cacheLife({ revalidate: 60, stale: 30, expire: 300 });
    cacheTag(`tenant:${tenantId}:dashboard`);

    const todayStart = startOfToday();
    const weekStart = startOfLastWeek();

    // All four queries run in parallel against the DB. Each returns only
    // aggregated numbers (no rows), so the total payload stays tiny. Any
    // rejection short-circuits Promise.all and propagates out of the cached
    // function, which prevents Next from caching a failure shape.
    const [
      todayAgg,
      weekAgg,
      activeCartsCount,
      lowStockCount,
      abandonedCartsData,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [...COMPLETED_STATUSES] },
          createdAt: { gte: todayStart },
        },
        _sum: { total: true },
        _count: { _all: true },
      }),
      prisma.order.aggregate({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [...COMPLETED_STATUSES] },
          createdAt: { gte: weekStart },
        },
        _sum: { total: true },
        _count: { _all: true },
      }),
      prisma.order.count({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [...ACTIVE_CART_STATUSES] },
        },
      }),
      // Low stock: products where stock is set, stockMin is set, and
      // stock <= stockMin. Prisma cannot express column-to-column comparison
      // with its fluent API, so we use a parameterized raw query ($1).
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM "Product"
        WHERE "tenantId" = ${tenantId}
          AND "deletedAt" IS NULL
          AND "active" = true
          AND "stock" IS NOT NULL
          AND "stockMin" IS NOT NULL
          AND "stock" <= "stockMin"
      `,
      // Abandoned carts: SavedCart updated >2h ago, <24h, non-empty
      prisma.savedCart.findMany({
        where: {
          tenantId,
          updatedAt: {
            lt: new Date(Date.now() - 2 * 60 * 60 * 1000),
            gt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
          NOT: { itemsJson: "[]" },
        },
        select: { itemsJson: true },
      }),
    ]);

    return {
      tenantId,
      today: {
        salesCount: todayAgg._count._all,
        revenue: toNumOrZero(todayAgg._sum.total),
      },
      week: {
        salesCount: weekAgg._count._all,
        revenue: toNumOrZero(weekAgg._sum.total),
      },
      activeCarts: activeCartsCount,
      lowStockCount: lowStockCount[0]?.count != null ? Number(lowStockCount[0].count) : 0,
      abandonedCarts: (() => {
        let estimatedValue = 0;
        for (const cart of abandonedCartsData) {
          try {
            const items = JSON.parse(cart.itemsJson) as { price?: number; qty?: number; quantity?: number }[];
            if (Array.isArray(items)) {
              for (const i of items) {
                const qty = i.qty ?? i.quantity ?? 1;
                const price = typeof i.price === "number" ? i.price : 0;
                estimatedValue += price * qty;
              }
            }
          } catch { /* skip invalid JSON */ }
        }
        return { count: abandonedCartsData.length, estimatedValue };
      })(),
      generatedAt: new Date().toISOString(),
    };
  },
};
