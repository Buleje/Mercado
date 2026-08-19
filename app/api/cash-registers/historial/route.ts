import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { CashAuditTrailDB } from "@/lib/db/cash-audit-trail.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/cash-registers/historial — quién tocó la caja.
 *
 * Devuelve el rastro de auditoría de aperturas, cierres e ingresos/egresos
 * manuales del tenant. Sólo lectura: un registro de auditoría que la aplicación
 * pudiera editar no sirve como auditoría.
 *
 * Query: `?limit=50&registerId=<id>`
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "cash-historial");
  if (rl) return rl;

  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit")) || undefined;
    const registerId = searchParams.get("registerId") ?? undefined;

    const entries = await CashAuditTrailDB.list(auth.tenantId, { limit, registerId });
    return NextResponse.json({ entries });
  } catch (e) {
    logger.error("[cash-historial] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
