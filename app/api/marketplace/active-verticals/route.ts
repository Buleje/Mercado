/**
 * GET /api/marketplace/active-verticals
 *
 * Devuelve los IDs de vertical del Inicio que TIENEN tiendas publicadas
 * (comida, bodega, ferreteria, electro, farmacia). Alimenta la fila de chips
 * de vertical: si hay ≤1, la UI la oculta (no hay nada que elegir).
 *
 * @cross-tenant intentional — endpoint público marketplace (ADR-082).
 */
import { NextRequest, NextResponse } from "next/server";
import { MarketplaceStatsDB } from "@/lib/db/marketplace-public.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "marketplace-active-verticals");
  if (rl) return rl;
  try {
    const verticals = await MarketplaceStatsDB.getActiveVerticals();
    return NextResponse.json(
      { verticals },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (err) {
    logger.error("[active-verticals] failed", { err });
    // No crítico: lista vacía → la UI no muestra la fila de verticales.
    return NextResponse.json({ verticals: [] }, { status: 200 });
  }
}
