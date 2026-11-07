/**
 * lib/forecasting/price-optimizer.ts
 *
 * Pricing dinámico simple — solo sugiere, NUNCA aplica automáticamente.
 * El admin decide si aplicar el ajuste desde el panel.
 *
 * Rebajas (vence / no se vende / rota poco): la regla ÚNICA de
 * `lib/precios/rebajas.ts` — la misma que usa Comandos IA › Precios en bloque
 * (19-10). Aquí sólo queda lo propio: la subida por demanda alta
 * (stock < demanda prevista 7 días → +5-10 %).
 */

import "server-only";
import { ProductsDB } from "@/lib/db/products.db";
import { listaDeRebajas } from "@/lib/precios/rebajas-servidor";
import type { FilaRebaja, ListaRebajas } from "@/lib/precios/rebajas";
import { mapEnParalelo } from "./en-paralelo";
import { predictDemand } from "./demand-predictor";

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export type PriceSuggestionReason =
  | "slow_mover"     // lista de rebajas: sin ventas o rota poco
  | "hot_item"       // stock < demanda 7d
  | "fefo_urgent";   // lista de rebajas: vence en ≤15 días

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

const HOT_ITEM_INCREASE_MIN = 0.05;
const HOT_ITEM_INCREASE_MAX = 0.10;

/** Redondea al múltiplo de 0.10 más cercano (formato S/) */
function roundPrice(p: number): number {
  return Math.round(p * 10) / 10;
}

/** La rebaja de la lista única, con la forma de siempre (el cron y el filtro `reason` la leen así). */
function aSugerencia(f: FilaRebaja): PriceSuggestion {
  return {
    productId: f.productId,
    productName: f.nombre,
    currentPrice: f.precioHoy,
    suggestedPrice: f.precioNuevo,
    adjustmentPercent: f.pct,
    reason: f.motivo === "vence" ? "fefo_urgent" : "slow_mover",
    detail: f.detalle,
    currentStock: f.stock ?? 0,
    costPrice: f.costoHoy ?? 0,
  };
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Sugerencias de precio: las rebajas de la lista única (`listaDeRebajas`) +
 * las subidas por demanda alta. No modifica ningún precio.
 * `lista` = la que ya armó quien llama (la ruta la devuelve entera): no se lee dos veces.
 */
export async function suggestPriceAdjustments(
  tenantId: string,
  lista?: ListaRebajas,
): Promise<PriceSuggestion[]> {
  const rebajas = lista ?? (await listaDeRebajas(tenantId));
  const enRebaja = new Set(rebajas.filas.map((f) => f.productId));

  // Subidas: sólo lo que controla stock y no está para rebajar.
  const products = (await ProductsDB.getAll(tenantId)).filter(
    (p) => p.active && p.stock != null && !enRebaja.has(p.id),
  );
  // Predicciones en paralelo (de a 6): en serie eran ~320 consultas y 50 s en main (11-10).
  const predicciones = await mapEnParalelo(products, 6, (p) => predictDemand(tenantId, p.id, 7));

  const subidas: PriceSuggestion[] = [];
  for (const [indice, product] of products.entries()) {
    const pred7 = predicciones[indice];
    if (!pred7) continue;
    const currentStock = product.stock ?? 0;
    const currentPrice = product.price;
    const demand7 = pred7.predictedQuantity;

    // ── Hot item: stock < demanda 7 días ─────────────────────────────────────
    if (demand7 > 0 && currentStock < demand7 && currentPrice > 0) {
      const increase = HOT_ITEM_INCREASE_MIN +
        Math.min(
          (1 - currentStock / demand7) * HOT_ITEM_INCREASE_MAX,
          HOT_ITEM_INCREASE_MAX - HOT_ITEM_INCREASE_MIN,
        );
      const suggested = roundPrice(currentPrice * (1 + increase));

      subidas.push({
        productId: product.id,
        productName: product.name,
        currentPrice,
        suggestedPrice: suggested,
        adjustmentPercent: Math.round(((suggested - currentPrice) / currentPrice) * 100 * 10) / 10,
        reason: "hot_item",
        detail: `Stock (${currentStock}) < demanda 7d (${demand7} uds). Aumento del ${Math.round(increase * 100)}%.`,
        currentStock,
        costPrice: product.costPrice ?? 0,
      });
    }
  }

  // Vence primero, luego demanda alta, luego lo que no se vende / rota poco.
  const deRebaja = rebajas.filas.map(aSugerencia);
  return [
    ...deRebaja.filter((s) => s.reason === "fefo_urgent"),
    ...subidas,
    ...deRebaja.filter((s) => s.reason !== "fefo_urgent"),
  ];
}
