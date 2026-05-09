import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";

/**
 * GET /api/marketplace/live-stats
 *
 * Delegado a MarketplacePublicDB.getLiveStats() (cache 60s interno).
 * @cross-tenant intentional — agrega órdenes/stores de todos los tenants.
 */
export async function GET() {
  try {
    const data = await MarketplacePublicDB.getLiveStats();
    logger.info("[live-stats] ok", {
      ordersToday: data.ordersToday,
      shoppersToday: data.shoppersToday,
      activeStores: data.activeStores,
    });
    return NextResponse.json({ data });
  } catch (e) {
    logger.error("[live-stats] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { data: { ordersToday: 0, shoppersToday: 0, activeStores: 0, avgDeliveryMin: 25 } },
      { status: 200 },
    );
  }
}
