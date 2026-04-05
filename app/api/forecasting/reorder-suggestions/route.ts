/**
 * GET /api/forecasting/reorder-suggestions
 *
 * Devuelve los productos que necesitan reorden, calculados a partir de la
 * predicción de demanda para el lead time de cada proveedor + safety stock (20%).
 *
 * Roles permitidos: admin, almacenero
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { generateReorderSuggestions } from "@/lib/forecasting/auto-reorder";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  // 1. Auth
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  logger.info("[forecasting/reorder-suggestions] Solicitud recibida", {
    tenantId: auth.tenantId,
  });

  // 2. Calcular sugerencias
  try {
    const suggestions = await generateReorderSuggestions(auth.tenantId);

    logger.info("[forecasting/reorder-suggestions] OK", {
      tenantId: auth.tenantId,
      count: suggestions.length,
    });

    return NextResponse.json({
      total: suggestions.length,
      suggestions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[forecasting/reorder-suggestions] Error inesperado", {
      tenantId: auth.tenantId,
      error: message,
    });
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
