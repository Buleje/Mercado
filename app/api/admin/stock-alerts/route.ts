import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getReorderAlerts } from "@/lib/stock-alerts";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/stock-alerts
 * Retorna los productos en riesgo de agotarse en los próximos 7 días.
 * Ordenados por urgencia (días hasta agotarse, ascendente).
 */
export async function GET(req: NextRequest) {
  // 1. Auth — solo admin, owner y manager pueden ver alertas de stock
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;

  try {
    // 2. Lógica — tenantId siempre del JWT (canonical CUID)
    const alerts = await getReorderAlerts(tenantId);

    logger.info("[stock-alerts] alertas calculadas", {
      tenantId,
      total: alerts.length,
      criticos: alerts.filter((a) => a.urgency === "critico").length,
    });

    return NextResponse.json({
      alerts,
      total: alerts.length,
      criticos: alerts.filter((a) => a.urgency === "critico").length,
      urgentes: alerts.filter((a) => a.urgency === "urgente").length,
    });
  } catch (e) {
    logger.error("[stock-alerts] error al calcular alertas", {
      error: (e as Error).message,
      tenantId,
    });
    return NextResponse.json(
      { error: "Error al obtener alertas de stock" },
      { status: 500 },
    );
  }
}
