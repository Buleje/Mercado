"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import {
  Brain, Download, TrendingUp, TrendingDown, AlertTriangle,
  Target, BarChart3, ArrowUpRight, ArrowDownRight,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Trend = "up" | "down" | "stable";
type ForecastPeriod = "7d" | "30d" | "90d";

type CategoryTrend = {
  category: string;
  currentSales: number;
  previousSales: number;
  trend: Trend;
  growthPct: number;
  topProduct: string;
};

type KPI = {
  label: string;
  value: string;
  prevValue: string;
  trend: Trend;
  pct: number;
};

type Anomaly = {
  id: string;
  date: string;
  type: "spike" | "drop" | "unusual";
  description: string;
  severity: "alta" | "media" | "baja";
  metric: string;
  value: number;
  expected: number;
};

type Forecast = {
  period: ForecastPeriod;
  predictedRevenue: number;
  confidenceLow: number;
  confidenceHigh: number;
  predictedOrders: number;
  avgTicket: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

// ── Seed Data ─────────────────────────────────────────────────────────────────

const KPIS: KPI[] = [];

const CATEGORY_TRENDS: CategoryTrend[] = [];

const ANOMALIES: Anomaly[] = [];

const FORECASTS: Record<ForecastPeriod, Forecast> = {
  "7d":  { period: "7d",  predictedRevenue: 17150, confidenceLow: 15400, confidenceHigh: 18900, predictedOrders: 445, avgTicket: 38.5 },
  "30d": { period: "30d", predictedRevenue: 73500, confidenceLow: 65200, confidenceHigh: 81800, predictedOrders: 1910, avgTicket: 38.5 },
  "90d": { period: "90d", predictedRevenue: 225000, confidenceLow: 196000, confidenceHigh: 254000, predictedOrders: 5845, avgTicket: 38.5 },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function BusinessIntelligenceTab() {
  const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>("30d");
  const forecast = FORECASTS[forecastPeriod];

  const sortedTrends = useMemo(() => [...CATEGORY_TRENDS].sort((a, b) => b.growthPct - a.growthPct), []);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Brain className="h-6 w-6 text-primary" /> Business Intelligence
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Proyecciones, tendencias, anomalías y KPIs clave</p>
        </div>
        <button onClick={() => exportToCSV(CATEGORY_TRENDS.map(t => ({ categoria: t.category, ventas_actual: t.currentSales, ventas_anterior: t.previousSales, crecimiento: t.growthPct + "%", top_producto: t.topProduct })), "bi-tendencias")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-[var(--surface-alt)] dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {KPIS.map(kpi => (
          <div key={kpi.label} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{kpi.label}</p>
            <p className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground">{kpi.value}</p>
            <div className="flex items-center gap-1 mt-1">
              {kpi.trend === "up" ? <ArrowUpRight className="h-3 w-3 text-[var(--data-success-500)]" /> : <ArrowDownRight className="h-3 w-3 text-[var(--data-error-500)]" />}
              <span className={cn("text-xs font-bold", kpi.trend === "up" ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{kpi.pct > 0 ? "+" : ""}{kpi.pct}%</span>
              <span className="text-xs text-[var(--text-tertiary)] ml-1">vs. antes</span>
            </div>
          </div>
        ))}
      </div>

      {/* Forecast */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="font-extrabold text-sm text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2"><Target className="h-4 w-4 text-primary" /> Proyección de ventas</CardTitle>
          <div className="flex flex-wrap gap-1">
            {(["7d", "30d", "90d"] as ForecastPeriod[]).map(p => (
              <button key={p} onClick={() => setForecastPeriod(p)} className={cn("px-3 py-1 rounded-lg text-xs font-bold transition-colors", forecastPeriod === p ? "bg-primary text-white" : "text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] dark:hover:bg-accent")}>{p === "7d" ? "7 días" : p === "30d" ? "30 días" : "90 días"}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <div><p className="text-xs text-[var(--text-tertiary)] mb-1">Ingresos proyectados</p><p className="text-xl font-extrabold text-primary">{fmt(forecast.predictedRevenue)}</p></div>
          <div><p className="text-xs text-[var(--text-tertiary)] mb-1">Rango confianza</p><p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(forecast.confidenceLow)} – {fmt(forecast.confidenceHigh)}</p></div>
          <div><p className="text-xs text-[var(--text-tertiary)] mb-1">Pedidos esperados</p><p className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground">{forecast.predictedOrders.toLocaleString()}</p></div>
          <div><p className="text-xs text-[var(--text-tertiary)] mb-1">Ticket promedio</p><p className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground">{fmt(forecast.avgTicket)}</p></div>
        </div>
        {/* Confidence bar */}
        <div className="mt-4 relative h-6 bg-[var(--surface-sunken)] dark:bg-surface rounded-full overflow-hidden">
          <div className="absolute inset-y-0 bg-primary/20 rounded-full" style={{ left: `${(forecast.confidenceLow / forecast.confidenceHigh) * 100 * 0.5}%`, right: `${100 - 95}%` }} />
          <div className="absolute inset-y-0 left-0 bg-primary/60 rounded-full" style={{ width: `${(forecast.predictedRevenue / forecast.confidenceHigh) * 100}%` }} />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(forecast.predictedRevenue)}</span>
        </div>
      </div>

      {/* Category Trends */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5">
        <CardTitle className="font-extrabold text-sm text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2 mb-4"><BarChart3 className="h-4 w-4 text-primary" /> Tendencias por categoría</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="text-left text-xs font-bold text-[var(--text-tertiary)]"><th className="py-2 pr-4">Categoría</th><th className="py-2 pr-4">Ventas actual</th><th className="py-2 pr-4">Ventas anterior</th><th className="py-2 pr-4">Crecimiento</th><th className="py-2">Top producto</th></tr></thead>
            <tbody>
              {sortedTrends.map(t => (
                <tr key={t.category} className="border-t border-[var(--rule-soft)] dark:border-card-border">
                  <td className="py-2.5 pr-4 font-bold text-[var(--text-primary)] dark:text-foreground">{t.category}</td>
                  <td className="py-2.5 pr-4 text-[var(--text-secondary)] dark:text-muted">{fmt(t.currentSales)}</td>
                  <td className="py-2.5 pr-4 text-[var(--text-tertiary)]">{fmt(t.previousSales)}</td>
                  <td className="py-2.5 pr-4">
                    <span className={cn("font-bold flex items-center gap-1", t.growthPct >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                      {t.growthPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {t.growthPct > 0 ? "+" : ""}{t.growthPct}%
                    </span>
                  </td>
                  <td className="py-2.5 text-[var(--text-secondary)] dark:text-muted">{t.topProduct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Anomaly alerts */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5">
        <CardTitle className="font-extrabold text-sm text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2 mb-4"><AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)]" /> Alertas de anomalías</CardTitle>
        <div className="space-y-2">
          {ANOMALIES.map(a => {
            const sevMeta = { alta: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50", media: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50", baja: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30" };
            const sevColor = { alta: "text-[var(--data-error-500)]", media: "text-[var(--data-warning-500)]", baja: "text-[var(--data-success-500)]" };
            return (
              <div key={a.id} className={cn("rounded-xl p-3 border", sevMeta[a.severity])}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{a.description}</p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{a.metric} · {a.date}</p>
                  </div>
                  <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", sevColor[a.severity])}>{a.severity}</span>
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-1">Valor: <b>{a.value.toLocaleString()}</b> (esperado: {a.expected.toLocaleString()})</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
