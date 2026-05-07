import { NextRequest, NextResponse } from "next/server";
import { LiveSessionsDB, type LiveSession } from "@/lib/db/live-sessions.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * GET /api/lives/active — lives transmitiendo ahora (global por defecto)
 * Query params:
 *   - tenantId (opcional): filtra por vendor específico
 *   - includeUpcoming (opcional, boolean): también retorna próximas 14 días
 *   - includePast (opcional, boolean): también retorna pasadas (últimas 20)
 */
// Helper: elimina tenantId del objeto antes de exponerlo públicamente
function stripTenantId<T extends Record<string, unknown>>(
  arr: T[],
): Omit<T, "tenantId">[] {
  return arr.map((s) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tenantId: _tid, ...rest } = s;
    return rest as Omit<T, "tenantId">;
  });
}

export async function GET(req: NextRequest) {
  // F3: RL GENEROUS — endpoint público, bloquear abuse sin penalizar usuarios legítimos
  const rl = applyRateLimit(req, "GENEROUS", "lives-active");
  if (rl) return rl as unknown as NextResponse;

  try {
    const sp = req.nextUrl.searchParams;
    const tenantId = sp.get("tenantId");
    const includeUpcoming = sp.get("includeUpcoming") === "true";
    const includePast = sp.get("includePast") === "true";

    const [active, upcoming, past] = await Promise.all([
      LiveSessionsDB.listActive(tenantId),
      includeUpcoming
        ? LiveSessionsDB.listScheduled(tenantId, 14)
        : Promise.resolve([]),
      includePast
        ? LiveSessionsDB.listPast(tenantId, 20)
        : Promise.resolve([]),
    ]);

    // F3: Strip tenantId — dato interno, no debe exponerse en respuesta pública
    return NextResponse.json(
      {
        data: {
          active: stripTenantId(active as unknown as Record<string, unknown>[]),
          upcoming: stripTenantId(upcoming as unknown as Record<string, unknown>[]),
          past: stripTenantId(past as unknown as Record<string, unknown>[]),
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=30",
        },
      },
    );
  } catch (err) {
    logger.error("[api/lives/active] failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
