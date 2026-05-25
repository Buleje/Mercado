import { NextRequest, NextResponse } from "next/server";
import { RecommendationsDB } from "@/lib/db/recommendations.db";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { logger } from "@/lib/logger";

/**
 * GET /api/recommendations?phone=XXXXXXXXX&limit=8
 *
 * Returns personalized product recommendations based on:
 * 1. Products frequently bought by customers who also bought the same items (collaborative filtering)
 * 2. Products from the customer's most-purchased categories
 * 3. Falls back to best-sellers if no history
 *
 * Audit project-wide 2026-05-19: migrado a RecommendationsDB.forPhone.
 * 10+ prisma.* directos encapsulados en un solo método con sub-queries
 * paralelas via Promise.all (history → co-buyers → category fill → best-sellers fallback).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "8", 10) || 8, 1), 30);

  try {
    const tenantId = getTenantIdFromRequest(req);
    const results = await RecommendationsDB.forPhone(tenantId, { phone, limit });
    return NextResponse.json(results);
  } catch (e) {
    logger.error("[recommendations] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
