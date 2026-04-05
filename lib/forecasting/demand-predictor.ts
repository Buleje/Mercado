/**
 * lib/forecasting/demand-predictor.ts
 *
 * Motor de predicción de demanda por SKU.
 * Algoritmo: media móvil ponderada sobre historial de SaleItems (últimos 90 días).
 *
 * Pesos:
 *   Últimos  7 días → 3x
 *   Días   8-30     → 2x
 *   Días  31-90     → 1x
 *
 * Detecta tendencia (up / stable / down) y estacionalidad semanal.
 * No usa ninguna API externa — solo Math sobre la DB.
 */

import "server-only";
import { prisma } from "@/lib/prisma";

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export interface DemandPrediction {
  productId: number;
  productName: string;
  tenantId: string;
  daysAhead: number;
  /** Unidades predichas para el período solicitado */
  predictedQuantity: number;
  /** 0 (ninguna confianza) → 1 (alta confianza) */
  confidence: number;
  /** up | stable | down */
  trend: "up" | "stable" | "down";
  /** Unidades/día promedio ponderado */
  dailyRate: number;
  /** Distribución por día de semana (0=Dom … 6=Sáb): unidades/día esperadas */
  weekdayPattern: number[];
}

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Retorna el inicio del día (00:00:00) N días atrás desde ahora */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Calcula la confianza en base a la densidad de días con ventas */
function calcConfidence(daysWithSales: number, windowDays: number): number {
  // Al menos 14 días con datos sobre 90 → confianza máxima
  const ratio = Math.min(daysWithSales / Math.min(windowDays, 90), 1);
  return Math.round(ratio * 100) / 100;
}

// ── Lógica principal ──────────────────────────────────────────────────────────

/**
 * Predice la demanda de un producto específico.
 * Analiza los últimos 90 días de SaleItems y aplica media móvil ponderada.
 */
export async function predictDemand(
  tenantId: string,
  productId: number,
  daysAhead: number,
): Promise<DemandPrediction | null> {
  const since = daysAgo(90);

  // Traer historial de items vendidos de ese producto en los últimos 90 días
  const rows = await prisma.saleItem.findMany({
    where: {
      productId,
      sale: {
        tenantId,
        createdAt: { gte: since },
      },
    },
    select: {
      quantity: true,
      sale: { select: { createdAt: true } },
    },
  });

  // Obtener nombre del producto
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true, active: true },
  });

  if (!product) return null;

  // ── Acumular ventas por fecha ────────────────────────────────────────────────
  const now = new Date();
  const byDate = new Map<string, number>(); // "YYYY-MM-DD" → unidades
  const byWeekday: number[] = Array(7).fill(0);   // suma por día de semana
  const countByWeekday: number[] = Array(7).fill(0); // peso acumulado por día de semana

  for (const row of rows) {
    const date = new Date(row.sale.createdAt);
    const key = date.toISOString().slice(0, 10);
    byDate.set(key, (byDate.get(key) ?? 0) + row.quantity);
  }

  // ── Media móvil ponderada: construir los 90 días ─────────────────────────────
  let weightedTotal = 0;
  let totalWeight = 0;

  for (let i = 0; i < 90; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i - 1);
    const key = d.toISOString().slice(0, 10);
    const qty = byDate.get(key) ?? 0;
    const weekday = d.getDay();

    // Peso según ventana temporal
    const weight = i < 7 ? 3 : i < 30 ? 2 : 1;

    weightedTotal += qty * weight;
    totalWeight += weight;

    byWeekday[weekday] += qty * weight;
    countByWeekday[weekday] += weight;
  }

  const weightedDailyRate = totalWeight > 0 ? weightedTotal / totalWeight : 0;

  // Patrón por día de semana (unidades/día esperadas)
  const weekdayPattern = byWeekday.map((sum, idx) =>
    countByWeekday[idx] > 0 ? Math.round((sum / countByWeekday[idx]) * 100) / 100 : 0,
  );

  // ── Tendencia: comparar ventana reciente (7d) vs ventana anterior (30d) ──────
  let recent7 = 0;
  let prev23 = 0;

  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i - 1);
    const qty = byDate.get(d.toISOString().slice(0, 10)) ?? 0;
    if (i < 7) recent7 += qty;
    else prev23 += qty;
  }

  // Normalizar a unidades/día para comparar períodos de diferente longitud
  const recent7Rate = recent7 / 7;
  const prev23Rate = prev23 / 23;

  let trend: DemandPrediction["trend"] = "stable";
  if (recent7Rate > prev23Rate * 1.15) trend = "up";
  else if (recent7Rate < prev23Rate * 0.85) trend = "down";

  // ── Predicción total para el período ─────────────────────────────────────────
  const predictedQuantity = Math.max(
    Math.round(weightedDailyRate * daysAhead),
    0,
  );

  const daysWithSales = byDate.size;
  const confidence = calcConfidence(daysWithSales, 90);

  return {
    productId,
    productName: product.name,
    tenantId,
    daysAhead,
    predictedQuantity,
    confidence,
    trend,
    dailyRate: Math.round(weightedDailyRate * 100) / 100,
    weekdayPattern,
  };
}

/**
 * Predice la demanda de TODOS los productos activos de un tenant.
 * Los productos sin historial de ventas se omiten (confianza cero = ruido).
 */
export async function predictAllProducts(
  tenantId: string,
  daysAhead: number,
): Promise<DemandPrediction[]> {
  // Solo productos activos y no eliminados
  const products = await prisma.product.findMany({
    where: { tenantId, active: true, deletedAt: null },
    select: { id: true },
  });

  const results: DemandPrediction[] = [];

  // Ejecutar en lotes de 20 para no saturar el pool de conexiones
  const BATCH = 20;
  for (let i = 0; i < products.length; i += BATCH) {
    const slice = products.slice(i, i + BATCH);
    const predictions = await Promise.all(
      slice.map((p) => predictDemand(tenantId, p.id, daysAhead)),
    );
    for (const pred of predictions) {
      // Omitir productos sin ningún historial de ventas
      if (pred && pred.dailyRate > 0) results.push(pred);
    }
  }

  // Ordenar por demanda predicha descendente
  return results.sort((a, b) => b.predictedQuantity - a.predictedQuantity);
}
