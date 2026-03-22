"use client";
import { useState, useMemo } from "react";
import { TrendingUp, ArrowUp, ArrowDown, Download, AlertTriangle, BarChart3 } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

/* ── Types ── */
type Period = "7d" | "30d" | "90d";
type ForecastPoint = { date: string; actual: number | null; predicted: number; lower: number; upper: number };

/* ── Helpers ── */
function fmt(n: number) { return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }

const FORECAST: ForecastPoint[] = [];

/* ── Product Forecasts ── */
const PRODUCT_FORECASTS: { id: string; name: string; current: number; predicted7d: number; predicted30d: number; trend: number; stock: number; daysLeft: number }[] = [];

export default function SalesForecastTab() {
  const [period, setPeriod] = useState<Period>("30d");
  const [view, setView] = useState<"general" | "productos">("general");

  const filteredForecast = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const futurePoints = FORECAST.filter(p => p.date >= today);
    if (period === "7d") return futurePoints.slice(0, 7);
    if (period === "30d") return futurePoints.slice(0, 30);
    return futurePoints;
  }, [period]);

  const pastPoints = useMemo(() => FORECAST.filter(p => p.actual !== null), []);

  const totalPredicted = filteredForecast.reduce((s, p) => s + p.predicted, 0);
  const totalLower = filteredForecast.reduce((s, p) => s + p.lower, 0);
  const totalUpper = filteredForecast.reduce((s, p) => s + p.upper, 0);
  const avgDaily = filteredForecast.length ? Math.round(totalPredicted / filteredForecast.length) : 0;
  const pastAvg = pastPoints.length ? Math.round(pastPoints.reduce((s, p) => s + (p.actual ?? 0), 0) / pastPoints.length) : 0;
  const growthPct = pastAvg ? (((avgDaily - pastAvg) / pastAvg) * 100).toFixed(1) : "0";

  const maxVal = Math.max(...FORECAST.map(p => p.upper || p.actual || 0));

  const alertProducts = PRODUCT_FORECASTS.filter(p => p.daysLeft < 14);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" /> Forecasting de Ventas
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-1">Proyección basada en tendencias históricas y patrones estacionales</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-gray-100 dark:bg-surface rounded-xl p-1">
            {(["general", "productos"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 text-sm font-bold rounded-lg transition-colors capitalize", view === v ? "bg-white dark:bg-card shadow text-primary" : "text-gray-500 dark:text-muted")}>
                {v === "general" ? "Vista General" : "Por Producto"}
              </button>
            ))}
          </div>
          <button onClick={() => exportToCSV(filteredForecast.map(p => ({ Fecha: p.date, Prediccion: p.predicted, Min: p.lower, Max: p.upper })), "forecast")} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex bg-gray-100 dark:bg-surface rounded-xl p-1 w-fit">
        {([["7d", "7 Días"], ["30d", "30 Días"], ["90d", "90 Días"]] as const).map(([p, label]) => (
          <button key={p} onClick={() => setPeriod(p)} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 text-sm font-bold rounded-lg transition-colors", period === p ? "bg-white dark:bg-card shadow text-primary" : "text-gray-500 dark:text-muted")}>
            {label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {[
          { label: "Venta Proyectada", value: fmt(totalPredicted), sub: `${period === "7d" ? "7" : period === "30d" ? "30" : "90"} días`, color: "text-blue-600 dark:text-blue-400" },
          { label: "Promedio Diario", value: fmt(avgDaily), sub: "por día estimado", color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Crecimiento", value: `${Number(growthPct) > 0 ? "+" : ""}${growthPct}%`, sub: "vs periodo anterior", color: Number(growthPct) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400" },
          { label: "Rango Confianza", value: `${fmt(totalLower)} — ${fmt(totalUpper)}`, sub: "intervalo 95%", color: "text-purple-600 dark:text-purple-400" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase tracking-wider">{kpi.label}</p>
            <p className={cn("text-lg font-extrabold mt-1", kpi.color)}>{kpi.value}</p>
            <p className="text-xs text-gray-400 dark:text-muted mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {view === "general" ? (
        <>
          {/* Chart visualization */}
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-6">
            <h3 className="font-bold text-gray-900 dark:text-foreground mb-4 flex flex-wrap items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Gráfico de Proyección
            </h3>
            <div className="flex items-end gap-px h-48 overflow-x-auto">
              {FORECAST.map((point, i) => {
                const h = maxVal ? (point.predicted / maxVal) * 100 : 0;
                const isActual = point.actual !== null;
                const isToday = point.date === new Date().toISOString().split("T")[0];
                return (
                  <div key={i} className="flex flex-col items-center min-w-2 flex-1" title={`${fmtDate(point.date)}: ${fmt(point.predicted)}`}>
                    <div
                      className={cn(
                        "w-full rounded-t transition-all",
                        isToday ? "bg-yellow-400" : isActual ? "bg-blue-400 dark:bg-blue-500" : "bg-emerald-400 dark:bg-emerald-500 opacity-70"
                      )}
                      style={{ height: `${h}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-400 dark:text-muted mt-2">
              <span>← Histórico (30 días)</span>
              <span className="font-bold text-yellow-500">Hoy</span>
              <span>Proyección →</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-3 text-xs">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400" /> Ventas reales</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-400 opacity-70" /> Proyección</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-400" /> Hoy</span>
            </div>
          </div>

          {/* Daily forecast table */}
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border overflow-hidden">
            <div className="px-3 sm:px-6 py-4 border-b border-gray-100 dark:border-card-border">
              <h3 className="font-bold text-gray-900 dark:text-foreground">Detalle Diario</h3>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-gray-50 dark:bg-surface sticky top-0">
                  <tr>
                    <th className="text-left px-3 sm:px-6 py-3 font-semibold text-gray-500 dark:text-muted">Fecha</th>
                    <th className="text-right px-3 sm:px-6 py-3 font-semibold text-gray-500 dark:text-muted">Predicción</th>
                    <th className="text-right px-3 sm:px-6 py-3 font-semibold text-gray-500 dark:text-muted">Mín</th>
                    <th className="text-right px-3 sm:px-6 py-3 font-semibold text-gray-500 dark:text-muted">Máx</th>
                    <th className="text-center px-3 sm:px-6 py-3 font-semibold text-gray-500 dark:text-muted">Confianza</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredForecast.map((p, i) => (
                    <tr key={i} className="border-t border-gray-50 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface/50">
                      <td className="px-3 sm:px-6 py-3 font-semibold text-gray-900 dark:text-foreground">{fmtDate(p.date)}</td>
                      <td className="px-3 sm:px-6 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">{fmt(p.predicted)}</td>
                      <td className="px-3 sm:px-6 py-3 text-right text-gray-500 dark:text-muted">{fmt(p.lower)}</td>
                      <td className="px-3 sm:px-6 py-3 text-right text-gray-500 dark:text-muted">{fmt(p.upper)}</td>
                      <td className="px-3 sm:px-6 py-3 text-center">
                        <div className="w-full bg-gray-200 dark:bg-surface rounded-full h-2">
                          <div className="bg-emerald-400 h-2 rounded-full" style={{ width: `${Math.max(30, 95 - i * 2)}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Alerts */}
          {alertProducts.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h3 className="font-bold text-amber-800 dark:text-amber-300">{alertProducts.length} productos con riesgo de quiebre</h3>
              </div>
              <p className="text-sm text-amber-700 dark:text-amber-400">Basado en la proyección, estos productos necesitan reposición pronto.</p>
            </div>
          )}

          {/* Product forecast table */}
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border overflow-hidden">
            <div className="px-3 sm:px-6 py-4 border-b border-gray-100 dark:border-card-border">
              <h3 className="font-bold text-gray-900 dark:text-foreground">Pronóstico por Producto</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-gray-50 dark:bg-surface">
                  <tr>
                    <th className="text-left px-3 sm:px-6 py-3 font-semibold text-gray-500 dark:text-muted">Producto</th>
                    <th className="text-right px-3 sm:px-6 py-3 font-semibold text-gray-500 dark:text-muted">Venta/Día</th>
                    <th className="text-right px-3 sm:px-6 py-3 font-semibold text-gray-500 dark:text-muted">Proy. 7d</th>
                    <th className="text-right px-3 sm:px-6 py-3 font-semibold text-gray-500 dark:text-muted">Proy. 30d</th>
                    <th className="text-center px-3 sm:px-6 py-3 font-semibold text-gray-500 dark:text-muted">Tendencia</th>
                    <th className="text-right px-3 sm:px-6 py-3 font-semibold text-gray-500 dark:text-muted">Stock</th>
                    <th className="text-center px-3 sm:px-6 py-3 font-semibold text-gray-500 dark:text-muted">Días Cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {PRODUCT_FORECASTS.map((p, i) => (
                    <tr key={i} className={cn("border-t border-gray-50 dark:border-card-border", p.daysLeft < 14 && "bg-amber-50/50 dark:bg-amber-950/10")}>
                      <td className="px-3 sm:px-6 py-3 font-semibold text-gray-900 dark:text-foreground">{p.name}</td>
                      <td className="px-3 sm:px-6 py-3 text-right text-gray-700 dark:text-foreground">{p.current} ud</td>
                      <td className="px-3 sm:px-6 py-3 text-right font-bold text-blue-600 dark:text-blue-400">{p.predicted7d} ud</td>
                      <td className="px-3 sm:px-6 py-3 text-right font-bold text-purple-600 dark:text-purple-400">{p.predicted30d} ud</td>
                      <td className="px-3 sm:px-6 py-3 text-center">
                        <span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full", p.trend >= 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>
                          {p.trend >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                          {Math.abs(p.trend)}%
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 text-right text-gray-700 dark:text-foreground">{p.stock}</td>
                      <td className="px-3 sm:px-6 py-3 text-center">
                        <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", p.daysLeft >= 20 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : p.daysLeft >= 14 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>
                          {p.daysLeft}d
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
