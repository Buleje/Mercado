/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 */
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/activity-feed
 *
 * Devuelve las últimas 10 orders anonymized para el LiveActivityStrip.
 * Cache: 60s (gestionado en MarketplacePublicDB.getActivityFeed).
 */
export async function GET() {
  try {
    const data = await MarketplacePublicDB.getActivityFeed();
    return NextResponse.json({ data });
  } catch (e) {
    logger.error("[activity-feed] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ data: [] }, { status: 200 });
  }
}
