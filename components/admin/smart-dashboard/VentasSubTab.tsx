"use client";

import { SectionTitle } from "@buleje/design-system";
import { useCallback } from "react";
import {
  TrendingUp,
  Users,
  BarChart3,
  ChevronUp,
  ChevronDown,
  Plus,
  X,
  PieChart as PieChartIcon,
  Target,
} from "@buleje/design-system/icons";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type {
  ChartType,
  TopProduct,
  TopCustomer,
  HourBucket,
  Sale,
  SectionId,
  DashTabId,
} from "./types";
import { CHART_OPTIONS } from "./types";

// ── Lazy chart components ───────────────────────────────────────────────────────

const ChartSkeleton = ({ height = 200 }: { height?: number }) => (
  <div className="w-full bg-gray-100 dark:bg-zinc-700/40 animate-pulse rounded" style={{ height }} />
);

const DashboardCharts = dynamic(
  () => import("@/components/admin/smart-dashboard/DashboardCharts"),
  { ssr: false, loading: () => <ChartSkeleton height={200} /> }
);

const WeeklyGoalCard = dynamic(() => import("@/components/admin/WeeklyGoalCard"), { ssr: false });

// ── Skeleton helpers ─────────────────────────────────────────────────────────────

function SkeletonBar({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-3 w-28 rounded bg-gray-200 dark:bg-zinc-700 shrink-0" />
          <div className="h-5 rounded bg-gray-200 dark:bg-zinc-700" style={{ width: `${30 + (i % 4) * 15}%` }} />
        </div>
      ))}
    </div>
  );
}

// ── Props ───────────────────────────────────────────────────────────────────────

export interface VentasSubTabProps {
  loading: boolean;
  revenueToday: number;
  // Chart data
  activeCharts: ChartType[];
  setActiveCharts: React.Dispatch<React.SetStateAction<ChartType[]>>;
  showChartPicker: boolean;
  setShowChartPicker: (v: boolean) => void;
  chartVentasCategoria: { name: string; value: number }[];
  chartMetodoPago: { name: string; value: number }[];
  chartTop10: { name: string; qty: number; revenue: number }[];
  chartVentasHora: { name: string; ventas: number }[];
  chartTendenciaSemanal: { name: string; ventas: number }[];
  chartFlujoCaja: { name: string; ingresos: number; egresos: number }[];
  // Section data
  sales: Sale[];
  salesToday: Sale[];
  topProducts: TopProduct[];
  topCustomers: TopCustomer[];
  hourBuckets: HourBucket[];
  maxProductQty: number;
  maxHourAmount: number;
  // Section order
  sectionOrder: SectionId[];
  // Formatting
  fmtR: (n: number) => string;
  fmt: (n: number) => string;
  fmtShort: (n: number) => string;
}

// ── Component ────────────────────────────────────────────────────────────────────

export function VentasSubTab(props: VentasSubTabProps) {
  const {
    loading, revenueToday,
    activeCharts, setActiveCharts, showChartPicker, setShowChartPicker,
    chartVentasCategoria, chartMetodoPago, chartTop10, chartVentasHora,
    chartTendenciaSemanal, chartFlujoCaja,
    sales, salesToday, topProducts, hourBuckets, maxProductQty, maxHourAmount,
    sectionOrder,
    fmtR, fmt, fmtShort,
  } = props;

  const addChart = useCallback((chartId: ChartType) => {
    setActiveCharts(prev => {
      if (prev.length >= 6 || prev.includes(chartId)) return prev;
      const next = [...prev, chartId];
      localStorage.setItem("dashboard-active-charts", JSON.stringify(next));
      return next;
    });
    setShowChartPicker(false);
  }, [setActiveCharts, setShowChartPicker]);

  const removeChart = useCallback((chartId: ChartType) => {
    setActiveCharts(prev => {
      const next = prev.filter(c => c !== chartId);
      localStorage.setItem("dashboard-active-charts", JSON.stringify(next));
      return next;
    });
  }, [setActiveCharts]);

  const moveChart = useCallback((index: number, direction: "up" | "down") => {
    setActiveCharts(prev => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      localStorage.setItem("dashboard-active-charts", JSON.stringify(next));
      return next;
    });
  }, [setActiveCharts]);

  const chartLabel = useCallback(
    (id: ChartType) => CHART_OPTIONS.find(o => o.id === id)?.label ?? id,
    []
  );

  // Sections filtered for ventas tab
  const filteredSections = sectionOrder.filter(sid => {
    const tabMap: Record<string, DashTabId[]> = {
      "kpis": ["resumen", "ventas"],
      "margen-comparador": ["resumen", "finanzas"],
      "top-productos": ["ventas", "resumen"],
      "horario-pico": ["ventas", "resumen"],
      "clientes-alertas": ["clientes", "resumen"],
    };
    return (tabMap[sid] ?? ["resumen"]).includes("ventas");
  });

  return (
    <>
      {/* Mis Graficos */}
      {!loading && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--text-secondary)] dark:text-zinc-400" />
              <SectionTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-zinc-200">Mis Graficos</SectionTitle>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowChartPicker(!showChartPicker)}
                disabled={activeCharts.length >= 6}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                  activeCharts.length >= 6
                    ? "bg-gray-100 dark:bg-zinc-700 text-[var(--text-tertiary)] cursor-not-allowed"
                    : "bg-primary text-white hover:bg-primary-dark"
                )}
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar grafico
              </button>
              {showChartPicker && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-zinc-800 border border-[var(--rule-base)] dark:border-zinc-700 rounded-xl p-2 w-64">
                  {CHART_OPTIONS.filter(o => !activeCharts.includes(o.id)).map(option => (
                    <button
                      key={option.id}
                      onClick={() => addChart(option.id)}
                      className="w-full text-left px-3 py-2 text-xs text-[var(--text-primary)] dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                    >
                      {option.label}
                    </button>
                  ))}
                  {CHART_OPTIONS.filter(o => !activeCharts.includes(o.id)).length === 0 && (
                    <p className="text-xs text-[var(--text-tertiary)] px-3 py-2">Todos los graficos ya estan activos</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {activeCharts.length === 0 ? (
            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-dashed border-[var(--rule-base)] dark:border-zinc-600 p-8 text-center">
              <PieChartIcon className="w-8 h-8 text-[var(--text-tertiary)] dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-[var(--text-tertiary)] dark:text-zinc-500">Agrega graficos para visualizar tus datos</p>
              <p className="text-xs text-[var(--text-tertiary)] dark:text-zinc-600 mt-1">Haz click en &quot;+ Agregar grafico&quot; arriba</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeCharts.map((chartId, index) => (
                <div key={chartId} className="bg-white dark:bg-zinc-900 rounded-xl border border-[var(--rule-base)] dark:border-zinc-800 p-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{chartLabel(chartId)}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => moveChart(index, "up")} disabled={index === 0} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-30 transition-colors">
                        <ChevronUp className="w-3 h-3 text-[var(--text-tertiary)]" />
                      </button>
                      <button onClick={() => moveChart(index, "down")} disabled={index === activeCharts.length - 1} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-30 transition-colors">
                        <ChevronDown className="w-3 h-3 text-[var(--text-tertiary)]" />
                      </button>
                      <button onClick={() => removeChart(chartId)} className="p-1 rounded hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error)]/20 text-[var(--text-tertiary)] hover:text-[var(--data-error)] transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <DashboardCharts
                    chartId={chartId}
                    chartVentasCategoria={chartVentasCategoria}
                    chartMetodoPago={chartMetodoPago}
                    chartTop10={chartTop10}
                    chartVentasHora={chartVentasHora}
                    chartTendenciaSemanal={chartTendenciaSemanal}
                    chartFlujoCaja={chartFlujoCaja}
                    fmt={fmt}
                    fmtShort={fmtShort}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Weekly Goal */}
      <WeeklyGoalCard sales={sales} />

      {/* Cajeros ranking */}
      {!loading && salesToday.length > 0 && (() => {
        const cajeros = new Map<string, { ventas: number; count: number }>();
        for (const s of salesToday) {
          const cashier = (s as unknown as { cashierName?: string }).cashierName || "Cajero principal";
          const prev = cajeros.get(cashier) || { ventas: 0, count: 0 };
          prev.ventas += s.total ?? 0;
          prev.count += 1;
          cajeros.set(cashier, prev);
        }
        if (cajeros.size < 1) return null;
        const ranking = Array.from(cajeros.entries())
          .map(([name, d]) => ({ name, rate: d.count > 0 ? d.ventas / Math.max(1, d.count) : 0, ventas: d.ventas, count: d.count }))
          .sort((a, b) => b.ventas - a.ventas)
          .slice(0, 3);
        return (
          <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-[var(--text-tertiary)]" />
              <span className="text-sm font-semibold text-[var(--text-primary)]">Rendimiento cajeros hoy</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {ranking.map((c, i) => (
                <span key={c.name} className="text-xs text-[var(--text-primary)] dark:text-zinc-300">
                  <span className={cn("font-bold", i === 0 && "text-[var(--data-warning)]")}>{i + 1}.</span>{" "}
                  {c.name}: <strong>{fmtR(c.ventas)}</strong> ({c.count} ventas)
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Meta del día */}
      {!loading && (() => {
        let dailyGoal = 800;
        try { const stored = localStorage.getItem("daily-goal"); if (stored) dailyGoal = Number(stored) || 800; } catch { /* ignore */ }
        const dailyGoalPct = dailyGoal > 0 ? (revenueToday / dailyGoal) * 100 : 0;
        return (
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" /> Meta del día
              </p>
              <span className="text-xs font-bold text-primary">{dailyGoalPct.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, dailyGoalPct)}%` }} />
            </div>
          </div>
        );
      })()}

      {/* Reorderable sections for ventas tab */}
      {filteredSections.map((sectionId) => (
        <div key={sectionId}>
          {sectionId === "top-productos" && (
            <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
                <span className="text-sm font-semibold text-[var(--text-primary)]">Top 10 productos más vendidos</span>
              </div>
              {loading ? (
                <SkeletonBar rows={10} />
              ) : topProducts.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)] dark:text-zinc-500">No hay datos de ventas aun.</p>
              ) : (
                <div className="space-y-2">
                  {topProducts.map((prod, idx) => {
                    const pct = Math.max(4, (prod.qty / maxProductQty) * 100);
                    return (
                      <div key={String(prod.id)} className="flex items-center gap-2 text-sm">
                        <span className="w-5 text-right text-xs text-[var(--text-tertiary)] dark:text-zinc-500 font-mono shrink-0">{idx + 1}</span>
                        <span className="w-36 sm:w-44 truncate text-[var(--text-primary)] dark:text-zinc-300 shrink-0 text-xs" title={prod.name}>{prod.name}</span>
                        <div className="flex-1 h-5 rounded bg-gray-100 dark:bg-zinc-700 relative overflow-hidden">
                          <div className="absolute inset-y-0 left-0 rounded transition-all" style={{ width: `${pct}%`, backgroundColor: idx === 0 ? "var(--color-primary)" : "var(--color-primary)60" }} />
                          <span className="absolute inset-y-0 left-2 flex items-center text-[length:var(--ts-2xs)] font-semibold text-white z-10">{prod.qty} uds</span>
                        </div>
                        <span className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500 shrink-0 w-20 text-right tabular-nums">{fmtR(prod.revenue)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {sectionId === "horario-pico" && (
            <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4" style={{ color: "#f97316" }} />
                <span className="text-sm font-semibold text-[var(--text-primary)]">Ventas por hora (hoy)</span>
              </div>
              {loading ? (
                <SkeletonBar rows={4} />
              ) : salesToday.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)] dark:text-zinc-500">Sin ventas registradas hoy.</p>
              ) : (
                <div className="space-y-1">
                  {hourBuckets.map((bucket) => {
                    const pct = Math.max(0, (bucket.amount / maxHourAmount) * 100);
                    const isActive = bucket.hour === new Date().getHours();
                    return (
                      <div key={bucket.hour} className="flex items-center gap-2 text-xs">
                        <span className={cn("w-8 text-right shrink-0 font-mono", isActive ? "text-[var(--data-warning)] font-bold" : "text-[var(--text-tertiary)] dark:text-zinc-500")}>{bucket.label}</span>
                        <div className="flex-1 h-4 rounded bg-gray-100 dark:bg-zinc-700 relative overflow-hidden">
                          {pct > 0 && <div className="absolute inset-y-0 left-0 rounded transition-all" style={{ width: `${pct}%`, backgroundColor: isActive ? "#f97316" : "var(--color-primary)80" }} />}
                          {pct > 10 && <span className="absolute inset-y-0 left-2 flex items-center text-[length:var(--ts-2xs)] font-semibold text-white z-10">{fmtR(bucket.amount)}</span>}
                        </div>
                        {pct === 0 && <span className="text-[var(--text-tertiary)] dark:text-zinc-600 text-[length:var(--ts-2xs)]">--</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {sectionId === "kpis" && !loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Simplified KPIs for ventas - placeholder for future extension */}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
