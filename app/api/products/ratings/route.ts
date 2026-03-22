export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ReviewsDB } from "@/lib/jsondb";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";

/**
 * GET /api/products/ratings
 * Public endpoint — returns aggregated ratings per product.
 * Response: { [productId: number]: { rating: number, reviewCount: number } }
 */
export async function GET() {
  try {
    const tenantId = "main";

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
