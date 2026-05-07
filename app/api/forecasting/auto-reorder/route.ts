/**
 * POST /api/forecasting/auto-reorder
 *
 * Ejecuta la reorden automática: genera sugerencias y crea PurchaseOrders
 * reales en la DB, agrupadas por proveedor.
 *
 * Body (opcional):
 *   suggestions?: ReorderSuggestion[]  — si se omite, las calcula en tiempo real
 *
 * Roles permitidos: admin (solo admin puede crear POs automáticas)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import {
  generateReorderSuggestions,
  createAutoPurchaseOrders,
} from "@/lib/forecasting/auto-reorder";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// Schema opcional: si el cliente envía las sugerencias precalculadas
const BodySchema = z.object({
  /** Si no se envía, se calculan en tiempo real */
  usePrecalculated: z.boolean().optional().default(false),
}).strict();

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "forecasting-auto-reorder"); if (_rl) return _rl;
  // 1. Auth — solo admin puede crear POs automáticas
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  // 2. Validación del body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  logger.info("[forecasting/auto-reorder] Iniciando reorden automática", {
    tenantId: auth.tenantId,
    user: auth.username,
  });

  // 3. Generar sugerencias y crear POs
  try {
    const suggestions = await generateReorderSuggestions(auth.tenantId);

    if (suggestions.length === 0) {
      logger.info("[forecasting/auto-reorder] Sin sugerencias — no se crearon POs", {
        tenantId: auth.tenantId,
      });
      return NextResponse.json({
        message: "No hay productos que necesiten reorden en este momento.",
        purchaseOrders: [],
        suggestionsAnalyzed: 0,
      });
    }

    const purchaseOrders = await createAutoPurchaseOrders(auth.tenantId, suggestions);

    // Fire-and-forget: log de actividad
    logActivity(
      "auto_reorder_executed",
      "PurchaseOrder",
      `Reorden automática ejecutada manualmente por ${auth.username}: ${purchaseOrders.length} PO(s) creadas`,
      undefined,
      auth.username,
    ).catch(() => {});

    logger.info("[forecasting/auto-reorder] POs creadas", {
      tenantId: auth.tenantId,
      poCount: purchaseOrders.length,
      suggestionsUsed: suggestions.length,
    });

    return NextResponse.json({
      message: `${purchaseOrders.length} orden(es) de compra generadas automáticamente.`,
      suggestionsAnalyzed: suggestions.length,
      purchaseOrders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[forecasting/auto-reorder] Error inesperado", {
      tenantId: auth.tenantId,
      error: message,
    });
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
