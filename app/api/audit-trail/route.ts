import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ActivityLogDB } from "@/lib/db/activity-log.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/audit-trail
 *
 * Devuelve el historial de auditoría (ActivityLog) con paginación por offset.
 * Solo accesible por administradores.
 *
 * Query params:
 *   entity  — filtrar por entidad exacta (Sale, Product, Order…)
 *   user    — filtrar por usuario (búsqueda parcial)
 *   action  — filtrar por acción exacta (CREATE, UPDATE, DELETE…)
 *   limit   — registros por página (máx 200, default 50)
 *   offset  — desplazamiento para paginación (default 0)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const searchParams = req.nextUrl.searchParams;
    const entity = searchParams.get("entity");
    const user = searchParams.get("user");
    const action = searchParams.get("action");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Audit project-wide 2026-05-19: migrado a ActivityLogDB.listPaginated.
    const { logs, total } = await ActivityLogDB.listPaginated(auth.tenantId, {
      entity: entity ?? undefined,
      action: action ?? undefined,
      user: user ?? undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      logs: logs.map((r) => ({
        ...r,
        entityId: r.entityId ?? undefined,
        ipAddress: r.ipAddress ?? undefined,
        userAgent: r.userAgent ?? undefined,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    });
  } catch (e) {
    logger.error("[audit-trail] GET error", { error: String(e) });
    return NextResponse.json({ error: "Error cargando audit trail" }, { status: 500 });
  }
}
