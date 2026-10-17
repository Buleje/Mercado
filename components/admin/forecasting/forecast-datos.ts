/**
 * Datos de la Predicción de ventas: los schemas Zod de sus 3 endpoints, los
 * tipos que salen de ellos, el estado del tablero y la proyección día a día.
 *
 * Salió de `ForecastingDashboard.tsx` (985 líneas) sin cambiar nada: lo usan
 * `use-forecasting.ts` y los tres paneles (ForecastProyeccion, ForecastReorden,
 * ForecastPrecios), que ahora se montan también sueltos (plan «panel
 * unificado», ola 3: el reorden vive además en Compras › Sugerencias).
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas Zod para validar las respuestas de la API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema para GET /api/inventory/forecast
 * Devuelve el pronóstico para un producto específico.
 * Lo usamos para obtener el resumen de tendencia y forecast semanal.
 */
export const InventoryForecastSchema = z.object({
  historicalSales: z.array(
    z.object({ date: z.string(), qty: z.number() })
  ),
  dailyAvg: z.number(),
  weeklyAvg: z.number(),
  trend: z.enum(["SUBIENDO", "ESTABLE", "BAJANDO"]),
  forecastNext7: z.number(),
  daysOfStock: z.number(),
  reorderPoint: z.number(),
  seasonalNote: z.string().nullable(),
  product: z.object({
    id: z.number(),
    name: z.string(),
    stock: z.number(),
    stockMin: z.number(),
  }),
});

/** Schema para cada sugerencia de reorden */
export const ReorderSuggestionSchema = z.object({
  productId: z.number(),
  productName: z.string(),
  currentStock: z.number(),
  supplierId: z.string(),
  supplierName: z.string(),
  leadTimeDays: z.number(),
  demandDuringLeadTime: z.number(),
  safetyStock: z.number(),
  suggestedQuantity: z.number(),
  unitCost: z.number(),
  estimatedTotal: z.number(),
  unit: z.string(),
  confidence: z.number(),
});

/** Schema para GET /api/forecasting/reorder-suggestions */
export const ReorderResponseSchema = z.object({
  total: z.number(),
  suggestions: z.array(ReorderSuggestionSchema),
});

/** Schema para cada sugerencia de precio */
export const PriceSuggestionSchema = z.object({
  productId: z.number(),
  productName: z.string(),
  currentPrice: z.number(),
  suggestedPrice: z.number(),
  adjustmentPercent: z.number(),
  reason: z.enum(["slow_mover", "hot_item", "fefo_urgent"]),
  detail: z.string(),
  currentStock: z.number(),
  costPrice: z.number(),
});

/** Schema para GET /api/forecasting/price-suggestions */
export const PriceResponseSchema = z.object({
  total: z.number(),
  note: z.string(),
  suggestions: z.array(PriceSuggestionSchema),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tipos inferidos
// ─────────────────────────────────────────────────────────────────────────────

export type InventoryForecast = z.infer<typeof InventoryForecastSchema>;
export type ReorderSuggestion = z.infer<typeof ReorderSuggestionSchema>;
export type PriceSuggestion = z.infer<typeof PriceSuggestionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Estado del dashboard
// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardState {
  forecast: InventoryForecast | null;
  reorder: ReorderSuggestion[];
  prices: PriceSuggestion[];
  loading: boolean;
  errors: {
    forecast: string | null;
    reorder: string | null;
    prices: string | null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de visualización
// ─────────────────────────────────────────────────────────────────────────────

/** Días de la semana en español abreviado, para el breakdown */
const DIA_ABREV = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Devuelve el nombre del día a partir de una fecha "YYYY-MM-DD" */
function nombreDia(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return DIA_ABREV[d.getDay()] ?? dateStr;
}

/** Ingresos proyectados día a día (7 días) calculados desde weeklyAvg y dailyAvg */
export function buildDailyBreakdown(forecast: InventoryForecast): Array<{ dia: string; rev: number }> {
  // Construimos proyección proporcional usando el dailyAvg como base
  // y el historial de los últimos 7 días para ponderar cada día de la semana
  const now = new Date();
  const resultado: Array<{ dia: string; rev: number }> = [];

  // Calculamos ingresos diarios proyectados con dailyAvg * precio medio
  // Como el endpoint no devuelve revenue por día futuro, estimamos
  // distribuyendo weeklyAvg proporcionalmente entre días (uniforme = simple)
  const revPorDia = forecast.weeklyAvg > 0 ? forecast.weeklyAvg / 7 : forecast.dailyAvg;

  for (let i = 1; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    resultado.push({
      dia: nombreDia(dateStr),
      // Ligera variación diaria para que no sean barras perfectamente iguales
      // usando el historial reciente como peso relativo
      rev: Math.round(revPorDia * getWeekdayWeight(d.getDay(), forecast.historicalSales)),
    });
  }

  return resultado;
}

/**
 * Calcula un peso relativo para un día de la semana basándose en el historial.
 * Normaliza para que el promedio sea 1.0.
 */
function getWeekdayWeight(weekday: number, history: Array<{ date: string; qty: number }>): number {
  if (history.length === 0) return 1;

  const sumByWeekday = Array.from({ length: 7 }, () => 0);
  const cntByWeekday = Array.from({ length: 7 }, () => 0);

  for (const h of history) {
    const d = new Date(h.date + "T12:00:00");
    const w = d.getDay();
    sumByWeekday[w] += h.qty;
    cntByWeekday[w]++;
  }

  const avgByWeekday = sumByWeekday.map((s, i) =>
    cntByWeekday[i] > 0 ? s / cntByWeekday[i] : 0
  );

  const totalAvg = avgByWeekday.reduce((a, b) => a + b, 0) / 7;
  if (totalAvg === 0) return 1;

  return (avgByWeekday[weekday] ?? 0) / totalAvg || 1;
}
