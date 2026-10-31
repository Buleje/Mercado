import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getRumHistory } from "@/lib/rum-history";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/perf-history — rollup diario de Core Web Vitals reales
 * (RUM de clientes del storefront) del tenant de la sesión. Consumido por
 * el sub-tab "Historial real" de ?tab=rendimiento.
 */

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "analista"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const history = await getRumHistory(auth.tenantId);
    return NextResponse.json({ days: history.days });
  } catch (err) {
    logger.error("[admin/perf-history] read failed", { error: String(err) });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
