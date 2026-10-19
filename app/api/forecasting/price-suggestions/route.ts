/**
 * GET /api/forecasting/price-suggestions
 *
 * Devuelve sugerencias de ajuste de precio para productos con exceso de stock,
 * alta demanda o próximos a vencer (FEFO).
 *
 * IMPORTANTE: Este endpoint solo SUGIERE. No modifica ningún precio.
 * `rebajas` = la lista única «Rebajar lo que no se vende» (`lib/precios/rebajas.ts`,
 * la misma que arma Comandos IA › Precios en bloque); se aplica por
 * `/api/admin/comandos-ia/precios/aplicar` (OK explícito, recibo y deshacer).
 *
 * Query params:
 *   reason?: "slow_mover" | "hot_item" | "fefo_urgent"  — filtrar por tipo
 *
 * Roles permitidos: admin, almacenero
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { suggestPriceAdjustments } from "@/lib/forecasting/price-optimizer";
import type { PriceSuggestionReason } from "@/lib/forecasting/price-optimizer";
import { listaDeRebajas } from "@/lib/precios/rebajas-servidor";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  reason: z
    .enum(["slow_mover", "hot_item", "fefo_urgent"])
    .optional(),
});

export async function GET(req: NextRequest) {
  // 1. Auth
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  // 2. Validación
  const raw = {
    reason: req.nextUrl.searchParams.get("reason") ?? undefined,
  };

  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  logger.info("[forecasting/price-suggestions] Solicitud recibida", {
    tenantId: auth.tenantId,
    reasonFilter: parsed.data.reason,
  });

  // 3. Obtener sugerencias
  try {
    const rebajas = await listaDeRebajas(auth.tenantId);
    let suggestions = await suggestPriceAdjustments(auth.tenantId, rebajas);

    // Filtro opcional por tipo de razón
    if (parsed.data.reason) {
      const filter = parsed.data.reason as PriceSuggestionReason;
      suggestions = suggestions.filter((s) => s.reason === filter);
    }

    logger.info("[forecasting/price-suggestions] OK", {
      tenantId: auth.tenantId,
      total: suggestions.length,
    });

    return NextResponse.json({
      total: suggestions.length,
      note: "Sugerencias únicamente. Ningún precio ha sido modificado.",
      suggestions,
      rebajas,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[forecasting/price-suggestions] Error inesperado", {
      tenantId: auth.tenantId,
      error: message,
    });
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
