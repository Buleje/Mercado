import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { CrecimientoNegociosDB } from "@/lib/db/crecimiento-negocios.db";
import { logger } from "@/lib/logger";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// GET /api/superadmin/tenants/growth
// Seis meses (Lima) de movimiento por negocio: pedidos con su monto y, además,
// ventas POS, libro CTP y trozas, para que un aserradero también muestre
// crecimiento. La consulta y el cache viven en CrecimientoNegociosDB.
export async function GET(req: NextRequest) {
  try {
    const rateLimited = applyRateLimit(req, "GENEROUS", "sa-growth");
    if (rateLimited) return rateLimited;

    const session = await requirePlatform(req);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const data = await CrecimientoNegociosDB.crecimientoMensual();
    return NextResponse.json({ data });
  } catch (error) {
    logger.error("[superadmin/tenants/growth] Error fetching growth data", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: "Error loading growth data", data: [] }, { status: 500 });
  }
}
