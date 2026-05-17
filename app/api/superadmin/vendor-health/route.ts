/**
 * GET /api/superadmin/vendor-health
 *
 * Devuelve el summary persistido por el cron vendor-identity-recheck
 * (RENIEC/SUNAT degradation tracking). Si nunca corrió, retorna empty
 * con flag stale=true para que el dashboard muestre "esperando primer run".
 *
 * Audit ref: TD-058 — cierre del ciclo de monitoreo automático.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { cacheStore } from "@/lib/cache";
import { logger } from "@/lib/logger";

interface VendorHealthSummary {
  lastRunAt: string;
  total: number;
  checked: number;
  changed: number;
  errors: number;
  alerts: Array<{
    vendorId: string;
    tenantSlug: string | null;
    kind: "ruc-changed" | "ruc-not-found" | "dni-not-found";
    detail: string;
  }>;
}

const SUMMARY_KEY = "vendor-health:summary";
const STALE_HOURS = 36; // >24h sin run → flag

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const summary = cacheStore.get<VendorHealthSummary>(SUMMARY_KEY);

  if (!summary) {
    logger.info("[superadmin/vendor-health] no summary yet", { by: auth.username });
    return NextResponse.json({
      stale: true,
      neverRun: true,
      message: "El cron de re-verification aún no se ejecutó. Próxima corrida: 07:00 UTC diario.",
      summary: null,
    });
  }

  // Marcar stale si el último run fue hace >36h (cron debería correr diario).
  const ageMs = Date.now() - new Date(summary.lastRunAt).getTime();
  const stale = ageMs > STALE_HOURS * 60 * 60 * 1000;

  // KPIs derivados
  const healthScore = summary.total > 0
    ? Math.round(((summary.total - summary.alerts.length) / summary.total) * 100)
    : 100;

  const alertsByKind = summary.alerts.reduce<Record<string, number>>((acc, a) => {
    acc[a.kind] = (acc[a.kind] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    stale,
    neverRun: false,
    ageMinutes: Math.floor(ageMs / 60000),
    healthScore,
    alertsByKind,
    summary,
  });
}
