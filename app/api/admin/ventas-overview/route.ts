import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { VentasOverviewDB, type VentasRange } from "@/lib/db/ventas-overview.db";
import { ApiError, toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

// ── Schema de query params ─────────────────────────────────────────────────────

const QuerySchema = z.object({
  range: z.enum(["hoy", "7d", "30d"]).default("7d"),
});

// ── GET /api/admin/ventas-overview?range=hoy|7d|30d ───────────────────────────

/**
 * Tablero de Ventas — 3 canales (marketplace, tienda online, POS).
 * READ-ONLY. Cacheado 2 min por tenant via VentasOverviewDB.
 *
 * Roles autorizados: admin | cajero | superadmin
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "superadmin"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetro range inválido. Usar: hoy | 7d | 30d" },
      { status: 400 },
    );
  }

  const range: VentasRange = parsed.data.range;

  try {
    const data = await VentasOverviewDB.get(auth.tenantId, range);
    return NextResponse.json(data);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    if (!(err instanceof ApiError)) {
      logger.error("[api/admin/ventas-overview] GET failed", {
        tenantId: auth.tenantId,
        range,
        error: String(err),
      });
    }
    return NextResponse.json(payload, { status });
  }
}
