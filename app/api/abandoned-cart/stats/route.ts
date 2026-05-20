import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AbandonedCartStatsDB } from "@/lib/db/abandoned-cart-stats.db";

/**
 * GET /api/abandoned-cart/stats
 *
 * Retorna conteo y valor estimado de carritos abandonados (>2h, <24h)
 * para mostrar en el dashboard admin. Filtrado por tenantId.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const result = await AbandonedCartStatsDB.getStats(auth.tenantId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
