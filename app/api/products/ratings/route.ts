import { NextRequest, NextResponse } from "next/server";
import { ReviewsDB } from "@/lib/jsondb";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { tryAdmin } from "@/lib/require-admin";
import { getTenantIdFromRequest } from "@/lib/tenant";


/**
 * GET /api/products/ratings
 * Semi-public endpoint — returns aggregated ratings per product.
 * tenantId resolved from: 1) JWT (admin session), 2) x-tenant-id header (middleware from subdomain).
 * Response: { [productId: number]: { rating: number, reviewCount: number } }
 */
export async function GET(req: NextRequest) {
  try {
    // Prefer JWT tenant (admin session) — fallback to subdomain header set by middleware
    const session = await tryAdmin(req);
    const tenantId = session?.tenantId ?? getTenantIdFromRequest(req);

    const ratings = await getOrSet(
      `product-ratings:${tenantId}`,
      300, // 5-minute TTL
      () => ReviewsDB.getAggregatedRatings(tenantId),
    );

    return NextResponse.json(ratings, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    logger.error("[products/ratings] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
