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
 *   period  — ventana de tiempo: today | 7d | 30d | all (default all)
 *   summary — si "1", incluye conteo por acción (entity/user/period, sin action)
 *   limit   — registros por página (máx 200, default 50)
 *   offset  — desplazamiento para paginación (default 0)
 */

/** Traduce el período a una fecha `since`, o undefined para "todo". */
function periodToSince(period: string | null): Date | undefined {
  const now = Date.now();
  switch (period) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    default:
      return undefined;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const searchParams = req.nextUrl.searchParams;
    const entity = searchParams.get("entity");
    const user = searchParams.get("user");
    const action = searchParams.get("action");
    const since = periodToSince(searchParams.get("period"));
    const wantSummary = searchParams.get("summary") === "1";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Audit project-wide 2026-05-19: migrado a ActivityLogDB.listPaginated.
    const [{ logs, total }, summary] = await Promise.all([
      ActivityLogDB.listPaginated(auth.tenantId, {
        entity: entity ?? undefined,
        action: action ?? undefined,
        user: user ?? undefined,
        since,
        limit,
        offset,
      }),
      wantSummary
        ? ActivityLogDB.summarize(auth.tenantId, {
            entity: entity ?? undefined,
            user: user ?? undefined,
            since,
          })
        : Promise.resolve(null),
    ]);

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
      ...(summary ? { summary } : {}),
    });
  } catch (e) {
    logger.error("[audit-trail] GET error", { error: String(e) });
    return NextResponse.json({ error: "Error cargando audit trail" }, { status: 500 });
  }
}
