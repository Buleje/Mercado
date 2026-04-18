import { NextRequest, NextResponse } from "next/server";
import { LiveSessionsDB } from "@/lib/db/live-sessions.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/lives/active — lives transmitiendo ahora (global por defecto)
 * Query params:
 *   - tenantId (opcional): filtra por vendor específico
 *   - includeUpcoming (opcional, boolean): también retorna próximas 14 días
 *   - includePast (opcional, boolean): también retorna pasadas (últimas 20)
 */
export async function GET(req: NextRequest) {
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

    return NextResponse.json(
      {
        data: {
          active,
          upcoming,
          past,
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
