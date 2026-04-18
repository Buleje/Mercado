import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { GiftCardsDB } from "@/lib/db/gift-cards.db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/gift-cards/stats — ADR-077
 *
 * Stats agregadas del tenant para el dashboard de admin:
 *   - vendidas / ingreso / canjeadas (ultimos 30 dias)
 *   - saldo pendiente (pasivo por canjear)
 *   - totales activas / canceladas
 *
 * Requiere role admin. Cacheado 2 minutos en la DB class.
 */

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const stats = await GiftCardsDB.getStats(auth.tenantId);
    return apiSuccess({ stats, generatedAt: new Date().toISOString() });
  } catch (e) {
    logger.error("[admin/gift-cards/stats] error", {
      err: e instanceof Error ? e.message : String(e),
      tenantId: auth.tenantId,
    });
    return apiError("Error interno", 503);
  }
}
