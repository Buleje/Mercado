import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { getFinanceAggregates } from "@/lib/finance/get-finance-aggregates";

/**
 * GET /api/admin/finance-aggregates?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * FUENTE ÚNICA de los KPIs financieros (ingresos, gastos, utilidad, por pagar,
 * deuda de fiados, valor de stock). Reemplaza el re-fetch+re-agregado crudo que
 * hacían decenas de tabs (auditoría 2026-06-15). Sin período → mes actual.
 */
function defaultPeriod(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const mm = String(m + 1).padStart(2, "0");
  const lastDay = new Date(y, m + 1, 0).getDate();
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const sp = new URL(req.url).searchParams;
  const fromQ = sp.get("from");
  const toQ = sp.get("to");
  const period = isDate(fromQ) && isDate(toQ) ? { from: fromQ, to: toQ } : defaultPeriod();

  try {
    const data = await getFinanceAggregates(auth.tenantId, period);
    return NextResponse.json({ period, ...data });
  } catch (e) {
    logger.error("[finance-aggregates] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
