export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StockoutPredictionsDB } from "@/lib/db";
import { logger } from "@/lib/logger";

function validateCronSecret(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const expected = process.env.CRON_SECRET;
  if (!expected || !secret) return false;
  return secret === expected;
}

export async function POST(req: NextRequest) {
  if (!validateCronSecret(req)) {
    logger.warn("[marketplace-stockout-predictions] Invalid CRON_SECRET");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const stores = await prisma.store.findMany({
      where: { isPublished: true },
      select: { id: true, tenantId: true, slug: true },
    });
    logger.info("[marketplace-stockout-predictions] Starting", { storeCount: stores.length });
    let totalComputed = 0;
    for (const store of stores) {
      try {
        const count = await StockoutPredictionsDB.compute(store.tenantId, store.id);
        totalComputed += count;
        logger.info("[marketplace-stockout-predictions] Computed for store", { storeId: store.id, tenantId: store.tenantId, storeSlug: store.slug, count });
      } catch (err) {
        logger.error("[marketplace-stockout-predictions] Error computing for store", { storeId: store.id, tenantId: store.tenantId, error: err instanceof Error ? err.message : String(err) });
      }
    }
    const uniqueTenants = [...new Set(stores.map((s) => s.tenantId))];
    let totalCleaned = 0;
    for (const tenantId of uniqueTenants) {
      try {
        const cleaned = await StockoutPredictionsDB.cleanup(tenantId);
        totalCleaned += cleaned;
        logger.info("[marketplace-stockout-predictions] Cleaned expired", { tenantId, count: cleaned });
      } catch (err) {
        logger.error("[marketplace-stockout-predictions] Error cleaning for tenant", { tenantId, error: err instanceof Error ? err.message : String(err) });
      }
    }
    logger.info("[marketplace-stockout-predictions] Completed", { totalComputed, totalCleaned, storeCount: stores.length });
    return NextResponse.json({ ok: true, totalComputed, totalCleaned, storeCount: stores.length });
  } catch (err) {
    logger.error("[marketplace-stockout-predictions] Fatal error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}