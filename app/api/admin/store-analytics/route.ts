import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { AdminStoreAnalyticsDB } from "@/lib/db/admin-store-analytics.db";

/**
 * GET /api/admin/store-analytics
 *
 * Agregaciones desde `ProductAnalytics` para el panel admin del bodeguero.
 * Devuelve:
 *   - kpis: totales del período (views, addsToCart, conversions, revenue, conv rate, cart abandon rate)
 *   - topByViews: top 10 productos por vistas
 *   - topByRevenue: top 10 productos por revenue
 *   - dailyTrend: serie diaria de views/conversions/revenue
 *
 * Query params:
 *   - days: 7 | 30 | 90 (default 30)
 *
 * Audit project-wide 2026-05-19: migrado a AdminStoreAnalyticsDB (regla #1 CLAUDE.md).
 */

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { days } = parsed.data;
  const tenantId = auth.tenantId;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const { totals, topByViews, topByRevenue, dailyTrend } =
      await AdminStoreAnalyticsDB.getAnalytics(tenantId, since);

    // Beneficio "Analytics avanzado" (superadmin > Beneficios): desbloquea
    // funnel + tendencia diaria + tabla de ingresos. El flag vive en la columna
    // jsonb benefits de Store (fuera de schema.prisma — zona peligrosa) →
    // raw SQL parametrizado via AdminStoreAnalyticsDB.checkAdvancedAnalytics.
    // Fail-safe: si falla, queda bloqueado (false).
    let advancedAnalytics = false;
    try {
      advancedAnalytics = await AdminStoreAnalyticsDB.checkAdvancedAnalytics(tenantId);
    } catch {
      /* sin beneficio detectable → bloqueado */
    }

    const conversionRate =
      totals.views > 0 ? totals.conversions / totals.views : 0;
    const cartAbandonRate =
      totals.addsToCart > 0
        ? Math.max(
            0,
            (totals.addsToCart - totals.conversions) / totals.addsToCart,
          )
        : 0;

    return NextResponse.json({
      ok: true,
      period: { days, since: since.toISOString() },
      kpis: {
        ...totals,
        conversionRate,
        cartAbandonRate,
      },
      topByViews,
      topByRevenue,
      dailyTrend,
      advancedAnalytics,
    });
  } catch (err) {
    logger.error("[store-analytics] error", { error: String(err), tenantId });
    return NextResponse.json(
      {
        error: "No se pudieron obtener las analíticas",
        detail: String(err).slice(0, 200),
      },
      { status: 500 },
    );
  }
}
