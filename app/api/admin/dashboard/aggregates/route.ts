import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AnalyticsDB } from "@/lib/db/analytics.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/dashboard/aggregates
 *
 * Returns pre-aggregated KPIs for the admin dashboard in one call:
 *   - today.salesCount  / today.revenue
 *   - week.salesCount   / week.revenue
 *   - activeCarts       (orders in flight)
 *   - lowStockCount     (products at/below stockMin)
 *
 * Why this exists:
 *   The old dashboard fetched raw order + product rows and aggregated them
 *   on the client. That wasted ~80% of the payload bytes and ~80-90% of
 *   client CPU per page load. This endpoint moves the aggregation into the
 *   database (Prisma `_sum` / `_count` / parameterised raw SQL) and caches
 *   the result per-tenant.
 *
 * Cache strategy (Next 16 Cache Components):
 *   The `"use cache"` directive lives inside `AnalyticsDB.getDashboardAggregates`
 *   with `cacheLife({ revalidate: 60, stale: 30, expire: 300 })` and
 *   `cacheTag("tenant:${tenantId}:dashboard")`. We do NOT set
 *   `export const dynamic = "force-dynamic"` or any segment config — those
 *   are incompatible with `cacheComponents: true` (see ADR-019).
 *
 * Auth:
 *   `requireAdmin(req, ["admin", "cajero"])` gates access. Tenant is
 *   resolved from the session/header by the helper, so tenant isolation is
 *   guaranteed before we hit the DB layer.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await AnalyticsDB.getDashboardAggregates(auth.tenantId);
    return NextResponse.json(data);
  } catch (e) {
    logger.error("[api/admin/dashboard/aggregates] GET failed", {
      tenantId: auth.tenantId,
      error: (e as Error).message,
    });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to compute aggregates" },
      { status: 500 },
    );
  }
}
