import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { SubscriptionsDB } from "@/lib/db/subscriptions.db";
import { ApiError, toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/subscriptions/stats
 *
 * KPIs de "Bodega al Mes" para el dashboard admin:
 *   - active / paused / cancelled counts
 *   - mrrEstimated (MRR estimado)
 *   - totalSavedEstimated (ahorro proyectado total)
 *
 * Cached 2 min via SubscriptionsDB.getStats; invalidado en cada write.
 * ADR-076.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, [
    "admin",
    "cajero",
    "owner",
    "manager",
    "analista",
  ]);
  if (auth instanceof NextResponse) return auth;

  try {
    const stats = await SubscriptionsDB.getStats(auth.tenantId);
    return NextResponse.json(stats);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    if (!(err instanceof ApiError)) {
      logger.error("[api/admin/subscriptions/stats] GET failed", {
        tenantId: auth.tenantId,
        error: String(err),
      });
    }
    return NextResponse.json(payload, { status });
  }
}
