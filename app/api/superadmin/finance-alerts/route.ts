import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { PlatformExpensesDB } from "@/lib/db/platform-expenses.db";
import { estimateAllTenantCosts } from "@/lib/cost-tracking";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/finance-alerts
 *
 * Estado liviano para el banner global de finanzas: ¿el gasto cruzó el tope?
 * ¿hay tiendas que cuestan más de lo que pagan? Reusa exactamente los mismos
 * cálculos que /superadmin/gastos (no recalcula dinero por su cuenta), y solo
 * devuelve el veredicto para que el aviso aparezca en todo el panel.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const [summary, budget, costs] = await Promise.all([
      PlatformExpensesDB.summary(),
      PlatformExpensesDB.getBudget(),
      estimateAllTenantCosts(),
    ]);

    const runRatePen = summary?.monthlyRunRatePen ?? 0;
    const budgetPen = typeof budget === "number" ? budget : null;
    const overspend =
      budgetPen !== null && budgetPen > 0 && runRatePen > budgetPen
        ? {
            runRatePen: Math.round(runRatePen * 100) / 100,
            budgetPen,
            overPen: Math.round((runRatePen - budgetPen) * 100) / 100,
            pct: Math.round((runRatePen / budgetPen) * 100),
          }
        : null;

    const losers = costs.filter((c) => c.grossMargin < 0);
    const worst = losers.reduce<(typeof costs)[number] | null>(
      (m, c) => (!m || c.grossMargin < m.grossMargin ? c : m),
      null,
    );
    const unprofitable =
      losers.length > 0
        ? {
            count: losers.length,
            worstName: worst?.tenantName ?? "",
            worstMargin: worst ? Math.round(worst.grossMargin) : 0,
          }
        : null;

    return NextResponse.json(
      { overspend, unprofitable, generatedAt: new Date().toISOString() },
      { headers: NO_STORE },
    );
  } catch (e) {
    logger.error("[superadmin/finance-alerts] GET", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
