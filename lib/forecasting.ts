/**
 * forecasting.ts
 * Algoritmo de media móvil ponderada para predecir ventas próximos 7 días.
 * NO usa API externa — puro Math sobre datos históricos de la bodega.
 */

export interface ForecastResult {
  predictedSales: number;       // ventas proyectadas próximos 7 días (unidades)
  predictedRevenue: number;     // ingresos proyectados (S/)
  confidence: "alta" | "media" | "baja";
  trend: "subiendo" | "estable" | "bajando";
  bestDay: string;              // día de la semana con más ventas
  worstDay: string;             // día con menos ventas
  dailyBreakdown: DayForecast[]; // proyección día a día (próximos 7)
}

export interface DayForecast {
  dayName: string;   // "Lunes", "Martes", etc.
  date: string;      // "2026-03-24"
  revenue: number;
}

interface SaleRecord {
  total: number;
  createdAt: string;
}

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/**
 * Calcula la media móvil ponderada de ventas.
 * Pesos: últimos 7 días → 3x, días 8-14 → 2x, días 15-30 → 1x
 */
export function calculateForecast(sales: SaleRecord[]): ForecastResult {
  const now = new Date();

  // ── Agrupar ventas por día (últimos 30 días) ──────────────────────────────
  const dayTotals = new Map<string, number>(); // key: "YYYY-MM-DD"
  const daysWithData = new Set<string>();

  for (const sale of sales) {
    const d = new Date(sale.createdAt);
    const key = d.toISOString().slice(0, 10);
    dayTotals.set(key, (dayTotals.get(key) ?? 0) + (sale.total ?? 0));
    daysWithData.add(key);
  }

  const totalDaysWithData = daysWithData.size;

  // ── Construir array de 30 días con totales (0 si no hubo venta) ───────────
  const revenueByWeekday: number[] = Array(7).fill(0);   // suma por día de semana
  const countByWeekday: number[] = Array(7).fill(0);     // cuántas semanas hay dato

  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i - 1); // desde ayer hacia atrás
    const key = d.toISOString().slice(0, 10);
    const revenue = dayTotals.get(key) ?? 0;
    const weekday = d.getDay();

    // Peso: últimos 7 días = 3, 8-14 = 2, 15-30 = 1
    const weight = i < 7 ? 3 : i < 14 ? 2 : 1;

    revenueByWeekday[weekday] += revenue * weight;
    countByWeekday[weekday] += weight;
  }

  // ── Media ponderada por día de la semana ─────────────────────────────────
  const avgByWeekday: number[] = revenueByWeekday.map((sum, idx) =>
    countByWeekday[idx] > 0 ? sum / countByWeekday[idx] : 0
  );

  // ── Proyectar próximos 7 días ─────────────────────────────────────────────
  const dailyBreakdown: DayForecast[] = [];
  let predictedRevenue = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i + 1);
    const weekday = d.getDay();
    const rev = Math.round(avgByWeekday[weekday]);
    predictedRevenue += rev;
    dailyBreakdown.push({
      dayName: DAY_NAMES[weekday],
      date: d.toISOString().slice(0, 10),
      revenue: rev,
    });
  }

  // ── Mejor y peor día ─────────────────────────────────────────────────────
  const sortedDays = avgByWeekday.map((avg, idx) => ({ day: DAY_NAMES[idx], avg }))
    .sort((a, b) => b.avg - a.avg);
  const bestDay = sortedDays[0]?.day ?? "Sábado";
  const worstDay = sortedDays[sortedDays.length - 1]?.day ?? "Martes";

  // ── Confidence ────────────────────────────────────────────────────────────
  const confidence: ForecastResult["confidence"] =
    totalDaysWithData >= 20 ? "alta" :
    totalDaysWithData >= 10 ? "media" : "baja";

  // ── Trend: comparar primer mitad vs segunda mitad de los 30 días ──────────
  let firstHalfRev = 0;
  let secondHalfRev = 0;

  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i - 1);
    const key = d.toISOString().slice(0, 10);
    const rev = dayTotals.get(key) ?? 0;
    if (i < 15) firstHalfRev += rev;   // últimos 15 días
    else secondHalfRev += rev;          // días 16-30
  }

  const trend: ForecastResult["trend"] =
    firstHalfRev > secondHalfRev * 1.1 ? "subiendo" :
    firstHalfRev < secondHalfRev * 0.9 ? "bajando" : "estable";

  // Ventas proyectadas en unidades: estimamos ticket promedio para dividir
  // (si no hay datos, asumir 1 unidad por S/10)
  const avgTicket = totalDaysWithData > 0
    ? (Array.from(dayTotals.values()).reduce((a, b) => a + b, 0) / totalDaysWithData) / 5
    : 10;
  const predictedSales = avgTicket > 0 ? Math.round(predictedRevenue / avgTicket) : 0;

  return {
    predictedSales,
    predictedRevenue,
    confidence,
    trend,
    bestDay,
    worstDay,
    dailyBreakdown,
  };
}
