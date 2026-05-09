import { NextRequest, NextResponse } from "next/server";
import { requireSupplier } from "@/lib/require-supplier";
import { SupplierRatingDB } from "@/lib/db/supplier-portal.db";
import { SupplierEvaluationsDB } from "@/lib/db/purchases.db";
import { toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/supplier/rating
 * Rating y ranking del proveedor autenticado.
 * Incluye:
 * - Historial mensual de SupplierRating
 * - Promedio de evaluaciones cualitativas (SupplierEvaluation)
 * - Comparativa anonimizada con el tenant
 */
export async function GET(req: NextRequest) {
  try {
    const supplier = await requireSupplier(req);
    if (!supplier) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { supplierId, tenantId } = supplier;

    // Periodo actual
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [monthlyRatings, evaluationAverages, tenantAverage, ranking] = await Promise.all([
      SupplierRatingDB.getBySupplierId(tenantId, supplierId),
      SupplierEvaluationsDB.getAverages(supplierId, tenantId),
      SupplierRatingDB.getTenantAverage(tenantId, currentPeriod),
      SupplierRatingDB.getRanking(tenantId, supplierId, currentPeriod),
    ]);

    const currentRating = monthlyRatings.find((r) => r.period === currentPeriod) ?? null;

    logger.debug("[SUPPLIER-RATING] fetched", { supplierId, currentPeriod });

    return NextResponse.json({
      currentPeriod,
      current: currentRating,
      history: monthlyRatings,
      qualityEvaluations: {
        punctuality: evaluationAverages.punctuality,
        quality: evaluationAverages.quality,
        price: evaluationAverages.price,
        totalEvaluations: evaluationAverages.count,
      },
      benchmarks: {
        // Comparativa anonimizada — no se expone qué proveedor es quién
        tenantAvgFillRate: tenantAverage.fillRate,
        tenantAvgDeliveryDays: tenantAverage.avgDeliveryDays,
        tenantAvgQualityScore: tenantAverage.qualityScore,
      },
      ranking: {
        position: ranking.position,
        total: ranking.total,
        percentile:
          ranking.total > 0
            ? Math.round(((ranking.total - ranking.position) / ranking.total) * 100)
            : null,
      },
    });
  } catch (err) {
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}
