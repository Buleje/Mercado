import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { MargenProveedorDB } from "@/lib/db/margen-proveedor.db";
import { logger } from "@/lib/logger";
import { startOfLimaDayDaysAgo } from "@/lib/utils";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

/**
 * GET /api/analytics/margen-por-proveedor?days=30
 *
 * Ventas, costo y ganancia de lo que le compras a cada proveedor en los
 * últimos `days` días (Lima). Cada producto va con el proveedor de su última
 * compra recibida; lo vendido sin compra recibida sale aparte. Mismos roles y
 * misma regla de ventas/costo que `/api/analytics/rentabilidad-productos`.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? DEFAULT_DAYS);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(Math.floor(daysRaw), MAX_DAYS) : DEFAULT_DAYS;
    const since = new Date(startOfLimaDayDaysAgo(days - 1));
    const data = await MargenProveedorDB.delPeriodo(auth.tenantId, since);
    return NextResponse.json({ ...data, periodDays: days, since: since.toISOString().slice(0, 10) });
  } catch (e) {
    logger.error("[analytics/margen-por-proveedor] GET error", { error: (e as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
