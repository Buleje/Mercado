"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
/**
 * ForecastingDashboard.tsx
 *
 * Dashboard de predicción de ventas para el panel admin.
 * Se integra como tab/sección dentro del admin panel existente.
 *
 * Paneles:
 *   A — Resumen de ventas proyectadas (7 días)  →  GET /api/inventory/forecast?productId=...
 *       Nota: se usa sin productId para el forecast global (primer producto activo como proxy)
 *             o directamente el endpoint de demand summary
 *   B — Productos para reordenar               →  GET /api/forecasting/reorder-suggestions
 *   C — Sugerencias de precios                 →  GET /api/forecasting/price-suggestions
 *   D — Top 5 productos por demanda proyectada →  derivado de reorder-suggestions
 *
 * Reglas respetadas:
 *   - "use client" solo en este archivo (sin propagar hacia arriba)
 *   - safeParse de Zod para validar respuestas de la API
 *   - No librerías de gráficos externas — barras con divs
 *   - Dark mode: todas las clases incluyen variantes dark:
 *   - Touch targets mínimo 44x44px
 *   - Estados loading / error / empty en cada panel
 *   - Colores brand: emerald (#2d6a4f), amber/orange (#f4a261) — no morado/indigo
 *   - Refresco manual con botón "Actualizar"
 */

import { useState, useCallback } from "react";
import { z } from "zod";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  ShoppingCart,
  Tag,
  AlertTriangle,
  Star,
  Package,
  Loader2,
  CheckCircle,
} from "@buleje/design-system/icons";
import { cn, formatCurrency } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas Zod para validar las respuestas de la API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema para GET /api/inventory/forecast
 * Devuelve el pronóstico para un producto específico.
 * Lo usamos para obtener el resumen de tendencia y forecast semanal.
 */
const InventoryForecastSchema = z.object({
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
const ReorderSuggestionSchema = z.object({
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
const ReorderResponseSchema = z.object({
  total: z.number(),
  suggestions: z.array(ReorderSuggestionSchema),
});

/** Schema para cada sugerencia de precio */
const PriceSuggestionSchema = z.object({
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
const PriceResponseSchema = z.object({
  total: z.number(),
  note: z.string(),
  suggestions: z.array(PriceSuggestionSchema),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tipos inferidos
// ─────────────────────────────────────────────────────────────────────────────

type InventoryForecast = z.infer<typeof InventoryForecastSchema>;
type ReorderSuggestion = z.infer<typeof ReorderSuggestionSchema>;
type PriceSuggestion = z.infer<typeof PriceSuggestionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Estado del dashboard
// ─────────────────────────────────────────────────────────────────────────────

interface DashboardState {
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
function buildDailyBreakdown(forecast: InventoryForecast): Array<{ dia: string; rev: number }> {
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

  const sumByWeekday = new Array(7).fill(0);
  const cntByWeekday = new Array(7).fill(0);

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

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export default function ForecastingDashboard() {
  const [state, setState] = useState<DashboardState>({
    forecast: null,
    reorder: [],
    prices: [],
    loading: false,
    errors: { forecast: null, reorder: null, prices: null },
  });

  // Estado de auto-reorder (Panel B)
  const [autoReordering, setAutoReordering] = useState(false);
  const [autoReorderMsg, setAutoReorderMsg] = useState<string | null>(null);

  // Estado de aplicar precio (Panel C)
  const [applyingPrice, setApplyingPrice] = useState<number | null>(null);
  const [appliedPrices, setAppliedPrices] = useState<Set<number>>(new Set());

  /**
   * Carga todos los paneles en paralelo.
   * Cada fetch falla independientemente para no bloquear los demás paneles.
   */
  const cargarDatos = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      loading: true,
      errors: { forecast: null, reorder: null, prices: null },
    }));

    // Lanzar los 3 fetches en paralelo
    const [forecastRes, reorderRes, pricesRes] = await Promise.allSettled([
      fetch("/api/inventory/forecast?productId=1").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch("/api/forecasting/reorder-suggestions").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch("/api/forecasting/price-suggestions").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    ]);

    // Procesar forecast con safeParse
    let forecast: InventoryForecast | null = null;
    let errorForecast: string | null = null;
    if (forecastRes.status === "fulfilled") {
      const parsed = InventoryForecastSchema.safeParse(forecastRes.value);
      if (parsed.success) {
        forecast = parsed.data;
      } else {
        errorForecast = "Datos de pronóstico inválidos";
      }
    } else {
      errorForecast = "No se pudo cargar el pronóstico";
    }

    // Procesar reorder con safeParse
    let reorder: ReorderSuggestion[] = [];
    let errorReorder: string | null = null;
    if (reorderRes.status === "fulfilled") {
      const parsed = ReorderResponseSchema.safeParse(reorderRes.value);
      if (parsed.success) {
        reorder = parsed.data.suggestions;
      } else {
        errorReorder = "Datos de reorden inválidos";
      }
    } else {
      errorReorder = "No se pudieron cargar sugerencias de reorden";
    }

    // Procesar precios con safeParse
    let prices: PriceSuggestion[] = [];
    let errorPrices: string | null = null;
    if (pricesRes.status === "fulfilled") {
      const parsed = PriceResponseSchema.safeParse(pricesRes.value);
      if (parsed.success) {
        prices = parsed.data.suggestions;
      } else {
        errorPrices = "Datos de precios inválidos";
      }
    } else {
      errorPrices = "No se pudieron cargar sugerencias de precios";
    }

    setState({
      forecast,
      reorder,
      prices,
      loading: false,
      errors: {
        forecast: errorForecast,
        reorder: errorReorder,
        prices: errorPrices,
      },
    });

    // Limpiar mensajes previos al actualizar
    setAutoReorderMsg(null);
    setAppliedPrices(new Set());
  }, []);

  /** Ejecuta auto-reorder (Panel B) */
  const ejecutarAutoReorder = async () => {
    setAutoReordering(true);
    setAutoReorderMsg(null);
    try {
      const res = await fetch("/api/forecasting/auto-reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usePrecalculated: false }),
      });
      const data = await res.json() as { message?: string; error?: string };
      setAutoReorderMsg(data.message ?? data.error ?? "Reorden ejecutado");
    } catch {
      setAutoReorderMsg("Error al ejecutar la reorden automática");
    } finally {
      setAutoReordering(false);
    }
  };

  /**
   * Aplica un precio sugerido (Panel C).
   * Llama al endpoint PATCH /api/products/[id] para actualizar el precio.
   */
  const aplicarPrecio = async (suggestion: PriceSuggestion) => {
    setApplyingPrice(suggestion.productId);
    try {
      const res = await fetch(`/api/products/${suggestion.productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: suggestion.suggestedPrice }),
      });
      if (res.ok) {
        setAppliedPrices((prev) => new Set([...prev, suggestion.productId]));
      }
    } catch {
      // Fallo silencioso — el usuario puede volver a intentarlo
    } finally {
      setApplyingPrice(null);
    }
  };

  // ── Top 5 productos por demanda proyectada (Panel D) ──────────────────────
  // Derivado de reorder-suggestions: los productos con mayor demandaDuranteLT
  const top5 = [...state.reorder]
    .sort((a, b) => b.demandDuringLeadTime - a.demandDuringLeadTime)
    .slice(0, 5);

  // ── Breakdown de días para el Panel A ─────────────────────────────────────
  const dailyBreakdown = state.forecast ? buildDailyBreakdown(state.forecast) : [];
  const maxRev = dailyBreakdown.length > 0
    ? Math.max(...dailyBreakdown.map((d) => d.rev), 1)
    : 1;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 p-4 md:p-6">

      {/* ── Header con botón Actualizar ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Prediccion de Ventas
          </SectionTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Proyecciones basadas en media móvil ponderada (&uacute;ltimos 30 d&iacute;as)
          </p>
        </div>
        <button
          onClick={cargarDatos}
          disabled={state.loading}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold",
            "bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] active:bg-[var(--accent-muted)]",
            "dark:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-soft)]",
            "text-white transition-colors",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            "min-h-[44px] min-w-[44px]", // touch target
          )}
          aria-label="Actualizar datos de prediccion"
        >
          <RefreshCw className={cn("w-4 h-4", state.loading && "animate-spin")} />
          <span className="hidden sm:inline">
            {state.loading ? "Cargando..." : "Actualizar"}
          </span>
        </button>
      </div>

      {/* ── Estado inicial: sin datos cargados ───────────────────────────── */}
      {!state.loading && state.forecast === null && state.reorder.length === 0 && state.prices.length === 0 &&
        !state.errors.forecast && !state.errors.reorder && !state.errors.prices && (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <RefreshCw className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Presiona <span className="text-[var(--data-success)] dark:text-[var(--data-success)] font-bold">Actualizar</span> para cargar las predicciones
          </p>
        </div>
      )}

      {/* ── Grid principal (2 columnas en desktop) ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ════════════════════════════════════════════════════════════════
            PANEL A — Resumen de ventas proyectadas (7 días)
        ════════════════════════════════════════════════════════════════ */}
        <PanelCard
          icon={<TrendingUp className="w-4 h-4" />}
          title="Ventas Proyectadas — 7 dias"
          loading={state.loading}
          error={state.errors.forecast}
          isEmpty={!state.forecast}
          emptyMsg="Presiona Actualizar para ver la prediccion"
        >
          {state.forecast && (
            <div className="space-y-6">

              {/* Nota estacional (quincena / feriado) */}
              {state.forecast.seasonalNote && (
                <div className="flex items-start gap-2 rounded-xl bg-[var(--data-warning-50)] dark:bg-amber-950/30 border border-[var(--data-warning)] dark:border-[var(--data-warning)]/50 p-3">
                  <AlertTriangle className="w-4 h-4 text-[var(--data-warning)] dark:text-[var(--data-warning)] mt-0.5 shrink-0" />
                  <p className="text-xs text-[var(--data-warning)] dark:text-[var(--data-warning)] font-medium">
                    {state.forecast.seasonalNote}
                  </p>
                </div>
              )}

              {/* Headline — ingresos proyectados */}
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                    {formatCurrency(state.forecast.weeklyAvg)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    proyectados en los proximos 7 dias
                  </p>
                </div>
                <TrendBadge trend={state.forecast.trend} />
              </div>

              {/* Métricas secundarias */}
              <div className="grid grid-cols-3 gap-2">
                <MetricChip
                  label="Promedio/dia"
                  value={formatCurrency(state.forecast.dailyAvg)}
                />
                <MetricChip
                  label="Dias de stock"
                  value={state.forecast.daysOfStock >= 999 ? "∞" : `${state.forecast.daysOfStock}d`}
                  danger={state.forecast.daysOfStock < 7}
                />
                <MetricChip
                  label="Punto reorden"
                  value={`${state.forecast.reorderPoint} u.`}
                />
              </div>

              {/* Mini-barras diarias */}
              <div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2">
                  Proyeccion dia a dia
                </p>
                <div className="flex items-end gap-1 h-20" role="img" aria-label="Grafico de barras proyeccion semanal">
                  {dailyBreakdown.map((d, i) => {
                    const pct = maxRev > 0 ? (d.rev / maxRev) * 100 : 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        {/* Valor sobre la barra */}
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium hidden sm:block">
                          {formatCurrency(d.rev).replace("S/ ", "")}
                        </span>
                        {/* Barra */}
                        <div className="w-full relative" style={{ height: "44px" }}>
                          <div
                            className="absolute bottom-0 left-0 right-0 rounded-t-md bg-[var(--accent-soft)] dark:bg-[var(--accent-soft)] transition-all duration-[var(--dur-slow)]"
                            style={{ height: `${Math.max(pct, 6)}%` }}
                          />
                        </div>
                        {/* Nombre del día */}
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          {d.dia}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </PanelCard>

        {/* ════════════════════════════════════════════════════════════════
            PANEL D — Top 5 productos por demanda proyectada
        ════════════════════════════════════════════════════════════════ */}
        <PanelCard
          icon={<Star className="w-4 h-4" />}
          title="Top 5 — Mayor Demanda Proyectada"
          loading={state.loading}
          error={state.errors.reorder}
          isEmpty={state.reorder.length === 0 && !state.loading && !state.errors.reorder}
          emptyMsg="Sin datos de demanda disponibles"
        >
          {top5.length > 0 && (
            <ol className="space-y-2">
              {top5.map((item, idx) => {
                const maxDemand = top5[0]?.demandDuringLeadTime ?? 1;
                const pct = maxDemand > 0 ? (item.demandDuringLeadTime / maxDemand) * 100 : 0;
                const medal = [`1°`, `2°`, `3°`, "4°", "5°"][idx];
                return (
                  <li key={item.productId} className="flex items-center gap-3">
                    {/* Posición */}
                    <span className="w-7 text-center text-sm font-bold text-slate-500 dark:text-slate-400 shrink-0">
                      {medal}
                    </span>
                    {/* Nombre + barra */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {item.productName}
                      </p>
                      <div className="mt-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--data-warning)] dark:bg-[var(--data-warning)] transition-all duration-[var(--dur-slow)]"
                          style={{ width: `${Math.max(pct, 6)}%` }}
                        />
                      </div>
                    </div>
                    {/* Demanda */}
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                      {item.demandDuringLeadTime} u.
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </PanelCard>

        {/* ════════════════════════════════════════════════════════════════
            PANEL B — Productos para reordenar
        ════════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-2">
          <PanelCard
            icon={<ShoppingCart className="w-4 h-4" />}
            title={`Productos para Reordenar${state.reorder.length > 0 ? ` (${state.reorder.length})` : ""}`}
            loading={state.loading}
            error={state.errors.reorder}
            isEmpty={state.reorder.length === 0 && !state.loading && !state.errors.reorder}
            emptyMsg="No hay productos que necesiten reorden en este momento"
            headerExtra={
              state.reorder.length > 0 ? (
                <button
                  onClick={ejecutarAutoReorder}
                  disabled={autoReordering}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold",
                    "bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600",
                    "text-white transition-colors",
                    "disabled:opacity-60 disabled:cursor-not-allowed",
                    "min-h-[44px]", // touch target
                  )}
                  aria-label="Ejecutar reorden automatica"
                >
                  {autoReordering
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5" />
                  }
                  Auto-reorden
                </button>
              ) : undefined
            }
          >
            {/* Mensaje resultado de auto-reorder */}
            {autoReorderMsg && (
              <div className={cn(
                "flex items-start gap-2 rounded-xl p-3 mb-3 text-xs font-medium",
                autoReorderMsg.startsWith("Error")
                  ? "bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error)] dark:border-[var(--data-error)]/50 text-[var(--data-error)] dark:text-[var(--data-error)]"
                  : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 text-[var(--data-success)] dark:text-[var(--data-success)]",
              )}>
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {autoReorderMsg}
              </div>
            )}

            {state.reorder.length > 0 && (
              /* Tabla responsive — scroll horizontal en mobile */
              <div className="overflow-x-auto -mx-1">
                <table className="w-full min-w-[540px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left py-2 px-2 font-semibold text-slate-500 dark:text-slate-400">Producto</th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-500 dark:text-slate-400">Stock actual</th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-500 dark:text-slate-400">Demanda LT</th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-500 dark:text-slate-400">Pedir</th>
                      <th className="text-right py-2 px-2 font-semibold text-slate-500 dark:text-slate-400">Total est.</th>
                      <th className="py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.reorder.map((item) => {
                      const critico = item.currentStock < item.demandDuringLeadTime;
                      return (
                        <tr
                          key={item.productId}
                          className={cn(
                            "border-b border-slate-50 dark:border-slate-800/50 transition-colors",
                            critico
                              ? "bg-[var(--data-error-50)]/60 dark:bg-red-950/20"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/40",
                          )}
                        >
                          {/* Nombre + proveedor */}
                          <td className="py-2.5 px-2">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {item.productName}
                              </span>
                              <span className="text-xs text-slate-400 dark:text-slate-500">
                                {item.supplierName} · LT {item.leadTimeDays}d
                              </span>
                            </div>
                          </td>

                          {/* Stock actual */}
                          <td className="py-2.5 px-2 text-right">
                            <span className={cn(
                              "font-bold",
                              critico
                                ? "text-[var(--data-error)] dark:text-[var(--data-error)]"
                                : "text-slate-700 dark:text-slate-300",
                            )}>
                              {item.currentStock} {item.unit}
                            </span>
                          </td>

                          {/* Demanda durante lead time */}
                          <td className="py-2.5 px-2 text-right font-medium text-slate-600 dark:text-slate-400">
                            {item.demandDuringLeadTime} {item.unit}
                          </td>

                          {/* Cantidad sugerida */}
                          <td className="py-2.5 px-2 text-right">
                            <span className="font-bold text-[var(--data-success)] dark:text-[var(--data-success)]">
                              {item.suggestedQuantity} {item.unit}
                            </span>
                          </td>

                          {/* Total estimado */}
                          <td className="py-2.5 px-2 text-right font-semibold text-slate-700 dark:text-slate-300">
                            {formatCurrency(item.estimatedTotal)}
                          </td>

                          {/* Badges */}
                          <td className="py-2.5 px-2">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              {critico && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-red-950/50 dark:text-[var(--data-error)]">
                                  Critico
                                </span>
                              )}
                              {item.confidence < 0.5 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-amber-950/50 dark:text-[var(--data-warning)]">
                                  Baja conf.
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </PanelCard>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            PANEL C — Sugerencias de precios
        ════════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-2">
          <PanelCard
            icon={<Tag className="w-4 h-4" />}
            title={`Sugerencias de Precios${state.prices.length > 0 ? ` (${state.prices.length})` : ""}`}
            loading={state.loading}
            error={state.errors.prices}
            isEmpty={state.prices.length === 0 && !state.loading && !state.errors.prices}
            emptyMsg="Sin sugerencias de ajuste de precio en este momento"
          >
            {state.prices.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {state.prices.map((s) => {
                  const isApplied = appliedPrices.has(s.productId);
                  const isApplying = applyingPrice === s.productId;
                  const esBaja = s.adjustmentPercent < 0;

                  return (
                    <PriceCard
                      key={s.productId}
                      suggestion={s}
                      isApplied={isApplied}
                      isApplying={isApplying}
                      onAplicar={() => aplicarPrecio(s)}
                      esBaja={esBaja}
                    />
                  );
                })}
              </div>
            )}
          </PanelCard>
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes (sin "use client" extra — son parte del mismo bundle client)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contenedor de panel reutilizable con estados loading / error / empty.
 */
interface PanelCardProps {
  icon: React.ReactNode;
  title: string;
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  emptyMsg: string;
  children?: React.ReactNode;
  headerExtra?: React.ReactNode;
}

function PanelCard({
  icon,
  title,
  loading,
  error,
  isEmpty,
  emptyMsg,
  children,
  headerExtra,
}: PanelCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 md:p-5 ">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[var(--data-success)] dark:text-[var(--data-success)]">{icon}</span>
          <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {title}
          </CardTitle>
        </div>
        {headerExtra}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-10 gap-2 text-slate-400 dark:text-slate-600">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-xs">Calculando predicciones...</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex items-start gap-2 rounded-xl bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error)] dark:border-[var(--data-error)]/50 p-3">
          <AlertTriangle className="w-4 h-4 text-[var(--data-error)] dark:text-[var(--data-error)] shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)]">{error}</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && isEmpty && (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Package className="w-7 h-7 text-slate-300 dark:text-slate-700" />
          <p className="text-xs text-slate-400 dark:text-slate-600 text-center">{emptyMsg}</p>
        </div>
      )}

      {/* Contenido */}
      {!loading && !error && !isEmpty && children}
    </div>
  );
}

/**
 * Badge de tendencia (Panel A).
 */
function TrendBadge({ trend }: { trend: "SUBIENDO" | "ESTABLE" | "BAJANDO" }) {
  const config = {
    SUBIENDO: {
      icon: <TrendingUp className="w-3.5 h-3.5" />,
      label: "Subiendo",
      cls: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
    },
    BAJANDO: {
      icon: <TrendingDown className="w-3.5 h-3.5" />,
      label: "Bajando",
      cls: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-red-950/40 dark:text-[var(--data-error)]",
    },
    ESTABLE: {
      icon: <Minus className="w-3.5 h-3.5" />,
      label: "Estable",
      cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    },
  } as const;

  const { icon, label, cls } = config[trend];

  return (
    <span className={cn("flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0", cls)}>
      {icon}
      {label}
    </span>
  );
}

/**
 * Chip de métrica pequeña (Panel A).
 */
function MetricChip({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2.5 text-center">
      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-0.5">{label}</p>
      <p className={cn(
        "text-sm font-extrabold",
        danger
          ? "text-[var(--data-error)] dark:text-[var(--data-error)]"
          : "text-slate-800 dark:text-slate-200",
      )}>
        {value}
      </p>
    </div>
  );
}

/**
 * Tarjeta de sugerencia de precio (Panel C).
 */
interface PriceCardProps {
  suggestion: PriceSuggestion;
  isApplied: boolean;
  isApplying: boolean;
  onAplicar: () => void;
  esBaja: boolean;
}

function PriceCard({ suggestion: s, isApplied, isApplying, onAplicar, esBaja }: PriceCardProps) {
  const reasonConfig: Record<PriceSuggestion["reason"], { label: string; cls: string }> = {
    hot_item: {
      label: "Demanda alta",
      cls: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-amber-950/50 dark:text-[var(--data-warning)]",
    },
    slow_mover: {
      label: "Stock excesivo",
      cls: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
    },
    fefo_urgent: {
      label: "Vence pronto",
      cls: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-red-950/50 dark:text-[var(--data-error)]",
    },
  };

  const { label: reasonLabel, cls: reasonCls } = reasonConfig[s.reason];
  const adjAbs = Math.abs(s.adjustmentPercent);

  return (
    <div className={cn(
      "rounded-xl border p-3.5 flex flex-col gap-3 transition-colors",
      isApplied
        ? "border-[var(--data-success)]/30 bg-[var(--accent-soft)] dark:border-[var(--data-success)]/30 dark:bg-[var(--accent-muted)]"
        : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30",
      s.reason === "fefo_urgent" && !isApplied
        ? "border-[var(--data-error)] dark:border-[var(--data-error)]/50"
        : "",
    )}>
      {/* Nombre + badge de razón */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug">
          {s.productName}
        </p>
        <span className={cn(
          "text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0",
          reasonCls,
        )}>
          {reasonLabel}
        </span>
      </div>

      {/* Precios */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400 dark:text-slate-500 line-through">
          {formatCurrency(s.currentPrice)}
        </span>
        <span className="text-slate-400 dark:text-slate-600">→</span>
        <span className={cn(
          "text-base font-extrabold",
          esBaja
            ? "text-[var(--data-error)] dark:text-[var(--data-error)]"
            : "text-[var(--data-success)] dark:text-[var(--data-success)]",
        )}>
          {formatCurrency(s.suggestedPrice)}
        </span>
        <span className={cn(
          "text-xs font-bold px-1.5 py-0.5 rounded-full",
          esBaja
            ? "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-red-950/40 dark:text-[var(--data-error)]"
            : "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
        )}>
          {esBaja ? "-" : "+"}{adjAbs}%
        </span>
      </div>

      {/* Detalle */}
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
        {s.detail}
      </p>

      {/* Stock */}
      <p className="text-xs text-slate-400 dark:text-slate-600">
        Stock actual: {s.currentStock} u.
      </p>

      {/* Botón Aplicar */}
      <button
        onClick={onAplicar}
        disabled={isApplied || isApplying}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold",
          "transition-colors min-h-[44px]", // touch target
          isApplied
            ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)] cursor-default"
            : "bg-[#2d6a4f] hover:bg-primary-dark active:bg-[#1d4a36] text-white",
          "disabled:opacity-60 disabled:cursor-not-allowed",
        )}
        aria-label={isApplied ? "Precio aplicado" : `Aplicar precio sugerido para ${s.productName}`}
      >
        {isApplying ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : isApplied ? (
          <>
            <CheckCircle className="w-3.5 h-3.5" />
            Aplicado
          </>
        ) : (
          "Aplicar precio"
        )}
      </button>
    </div>
  );
}
