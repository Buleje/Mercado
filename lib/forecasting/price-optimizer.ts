/**
 * lib/forecasting/price-optimizer.ts
 *
 * Pricing dinámico simple — solo sugiere, NUNCA aplica automáticamente.
 * El admin decide si aplicar el ajuste desde el panel.
 *
 * Reglas:
 *   - stock > 3x demanda 30d  → slow mover  → descuento 10-15%
 *   - stock < demanda 7d      → hot item    → aumento 5-10%
 *   - expiresAt < 15 días     → FEFO urgente → descuento 20-30%
 *   - Precio sugerido mínimo  → costPrice * 1.05 (5% margen mínimo)
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrZero } from "@/lib/decimal-utils";
import { predictDemand } from "./demand-predictor";

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export type PriceSuggestionReason =
  | "slow_mover"     // exceso de stock vs demanda 30d
  | "hot_item"       // stock < demanda 7d
  | "fefo_urgent";   // producto expira en <15 días

export interface PriceSuggestion {
  productId: number;
  productName: string;
  currentPrice: number;
  suggestedPrice: number;
  /** Porcentaje de ajuste: negativo = descuento, positivo = aumento */
  adjustmentPercent: number;
  reason: PriceSuggestionReason;
  /** Detalle legible para el admin */
  detail: string;
  currentStock: number;
  costPrice: number;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const SLOW_MOVER_THRESHOLD = 3;    // stock > 3x demanda 30d
const SLOW_MOVER_DISCOUNT_MIN = 0.10;
const SLOW_MOVER_DISCOUNT_MAX = 0.15;
const HOT_ITEM_INCREASE_MIN = 0.05;
const HOT_ITEM_INCREASE_MAX = 0.10;
const FEFO_DAYS_THRESHOLD = 15;
const FEFO_DISCOUNT_MIN = 0.20;
const FEFO_DISCOUNT_MAX = 0.30;
const MIN_MARGIN = 0.05;           // 5% margen mínimo sobre costPrice

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Redondea al múltiplo de 0.10 más cercano (formato S/) */
function roundPrice(p: number): number {
  return Math.round(p * 10) / 10;
}

/** Asegura que el precio no caiga por debajo de costPrice * (1 + MIN_MARGIN) */
function applyMinMargin(suggested: number, costPrice: number): number {
  const floor = costPrice * (1 + MIN_MARGIN);
  return Math.max(suggested, floor);
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Analiza todos los productos activos y devuelve sugerencias de ajuste de precio.
 * No modifica ningún precio — solo devuelve recomendaciones.
 */
export async function suggestPriceAdjustments(
  tenantId: string,
): Promise<PriceSuggestion[]> {
  const now = new Date();
  const fefoDeadline = new Date(now.getTime() + FEFO_DAYS_THRESHOLD * 24 * 60 * 60 * 1000);

  const products = await prisma.product.findMany({
    where: { tenantId, active: true, deletedAt: null, stock: { not: null } },
    select: {
      id: true,
      name: true,
      price: true,
      costPrice: true,
      stock: true,
      expiresAt: true,
      unit: true,
    },
  });

  const suggestions: PriceSuggestion[] = [];

  for (const product of products) {
    const currentStock = product.stock ?? 0;
    // TD-018: price y costPrice ahora son Decimal → convertir a number al inicio
    const currentPrice = toNumOrZero(product.price);
    const costPriceRaw = toNum(product.costPrice);
    const costPrice = costPriceRaw ?? currentPrice * 0.7;

    // ── FEFO urgente: expira en <15 días ─────────────────────────────────────
    if (product.expiresAt && product.expiresAt <= fefoDeadline) {
      const daysLeft = Math.max(
        Math.ceil((product.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        0,
      );

      // Descuento proporcional: a menos días, más descuento (entre 20% y 30%)
      const ratio = Math.max(1 - daysLeft / FEFO_DAYS_THRESHOLD, 0);
      const discount = FEFO_DISCOUNT_MIN + ratio * (FEFO_DISCOUNT_MAX - FEFO_DISCOUNT_MIN);
      const suggested = applyMinMargin(
        roundPrice(currentPrice * (1 - discount)),
        costPrice,
      );

      if (suggested < currentPrice) {
        suggestions.push({
          productId: product.id,
          productName: product.name,
          currentPrice,
          suggestedPrice: suggested,
          adjustmentPercent: Math.round(((suggested - currentPrice) / currentPrice) * 100 * 10) / 10,
          reason: "fefo_urgent",
          detail: `Expira en ${daysLeft} día(s). Descuento del ${Math.round(discount * 100)}% para acelerar rotación.`,
          currentStock,
          costPrice,
        });
        continue; // FEFO tiene prioridad, no evaluar otras reglas para este producto
      }
    }

    // ── Predicción de demanda para evaluar slow/hot ──────────────────────────
    const pred30 = await predictDemand(tenantId, product.id, 30);
    const pred7 = await predictDemand(tenantId, product.id, 7);

    if (!pred30 || !pred7) continue;

    const demand30 = pred30.predictedQuantity;
    const demand7 = pred7.predictedQuantity;

    // ── Hot item: stock < demanda 7 días ─────────────────────────────────────
    if (demand7 > 0 && currentStock < demand7) {
      const increase = HOT_ITEM_INCREASE_MIN +
        Math.min(
          (1 - currentStock / demand7) * HOT_ITEM_INCREASE_MAX,
          HOT_ITEM_INCREASE_MAX - HOT_ITEM_INCREASE_MIN,
        );
      const suggested = roundPrice(currentPrice * (1 + increase));

      suggestions.push({
        productId: product.id,
        productName: product.name,
        currentPrice,
        suggestedPrice: suggested,
        adjustmentPercent: Math.round(((suggested - currentPrice) / currentPrice) * 100 * 10) / 10,
        reason: "hot_item",
        detail: `Stock (${currentStock}) < demanda 7d (${demand7} uds). Aumento del ${Math.round(increase * 100)}%.`,
        currentStock,
        costPrice,
      });
      continue;
    }

    // ── Slow mover: stock > 3x demanda 30 días ───────────────────────────────
    if (demand30 > 0 && currentStock > demand30 * SLOW_MOVER_THRESHOLD) {
      const excessRatio = Math.min(
        (currentStock / (demand30 * SLOW_MOVER_THRESHOLD) - 1) / 2,
        1,
      );
      const discount = SLOW_MOVER_DISCOUNT_MIN +
        excessRatio * (SLOW_MOVER_DISCOUNT_MAX - SLOW_MOVER_DISCOUNT_MIN);
      const suggested = applyMinMargin(
        roundPrice(currentPrice * (1 - discount)),
        costPrice,
      );

      if (suggested < currentPrice) {
        suggestions.push({
          productId: product.id,
          productName: product.name,
          currentPrice,
          suggestedPrice: suggested,
          adjustmentPercent: Math.round(((suggested - currentPrice) / currentPrice) * 100 * 10) / 10,
          reason: "slow_mover",
          detail: `Stock (${currentStock}) > ${SLOW_MOVER_THRESHOLD}x demanda 30d (${demand30} uds). Descuento del ${Math.round(discount * 100)}%.`,
          currentStock,
          costPrice,
        });
      }
    }
  }

  // Ordenar: FEFO urgente primero, luego hot items, luego slow movers
  const reasonOrder: Record<PriceSuggestionReason, number> = {
    fefo_urgent: 0,
    hot_item: 1,
    slow_mover: 2,
  };

  return suggestions.sort((a, b) => reasonOrder[a.reason] - reasonOrder[b.reason]);
}
