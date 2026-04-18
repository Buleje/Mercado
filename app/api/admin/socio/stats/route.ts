import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { SocioBulejeDB } from "@/lib/db/socio-buleje.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/socio/stats
 *
 * Estadísticas agregadas del programa Socio Buleje para el panel admin.
 * Requiere rol admin. ADR-078.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const stats = await SocioBulejeDB.getStats(auth.tenantId);
    return NextResponse.json({ ok: true, stats, traceId });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    logger.warn("[api/admin/socio/stats] error", {
      traceId,
      tenantId: auth.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(payload, { status });
  }
}
