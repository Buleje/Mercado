/**
 * GET /api/forecasting/predict
 *
 * Predicción de demanda por producto o para todos los productos activos.
 *
 * Query params:
 *   productId?: number  — si se omite, predice todos los productos activos
 *   days?:      number  — horizonte en días (default: 30, máx: 90)
 *
 * Roles permitidos: admin, almacenero
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { predictDemand, predictAllProducts } from "@/lib/forecasting/demand-predictor";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  productId: z
    .string()
    .optional()
    .transform((v) => (v != null ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
  days: z
    .string()
    .optional()
    .transform((v) => (v != null ? parseInt(v, 10) : 30))
    .pipe(z.number().int().min(1).max(90)),
});

export async function GET(req: NextRequest) {
  // 1. Auth
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  // 2. Validación
  const raw = {
    productId: req.nextUrl.searchParams.get("productId") ?? undefined,
    days: req.nextUrl.searchParams.get("days") ?? undefined,
  };

  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { productId, days } = parsed.data;

  logger.info("[forecasting/predict] Solicitud recibida", {
    tenantId: auth.tenantId,
    productId,
    days,
  });

  // 3. Predicción
  try {
    if (productId != null) {
      const prediction = await predictDemand(auth.tenantId, productId, days);
      if (!prediction) {
        return NextResponse.json(
          { error: "Producto no encontrado o sin historial de ventas" },
          { status: 404 },
        );
      }
      logger.info("[forecasting/predict] Predicción individual OK", {
        tenantId: auth.tenantId,
        productId,
        predictedQuantity: prediction.predictedQuantity,
        confidence: prediction.confidence,
      });
      return NextResponse.json({ prediction });
    }

    // Sin productId → predecir todos
    const predictions = await predictAllProducts(auth.tenantId, days);
    logger.info("[forecasting/predict] Predicción masiva OK", {
      tenantId: auth.tenantId,
      total: predictions.length,
      days,
    });
    return NextResponse.json({
      total: predictions.length,
      daysAhead: days,
      predictions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[forecasting/predict] Error inesperado", {
      tenantId: auth.tenantId,
      error: message,
    });
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
