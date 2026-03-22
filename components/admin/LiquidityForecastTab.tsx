"use client";

import { useState, useMemo } from "react";
import {
  TrendingUp, Download, AlertTriangle,
  ArrowUp, ArrowDown, Wallet, DollarSign,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ForecastWeek = {
  weekLabel: string;
  startDate: string;
  inflows: number;
  outflows: number;
  balance: number;
  cumulative: number;
};

type Scenario = "base" | "optimista" | "pesimista";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

// ── Seed Data ─────────────────────────────────────────────────────────────────

const OPENING_BALANCE = 28500;

const BASE_WEEKS: Omit<ForecastWeek, "cumulative">[] = [];

function buildForecast(multiplier: number): ForecastWeek[] {
  let cum = OPENING_BALANCE;
  return BASE_WEEKS.map(w => {
    const inflows = Math.round(w.inflows * (multiplier > 1 ? multiplier : 1));
    const outflows = Math.round(w.outflows * (multiplier < 1 ? 1 : multiplier < 1.15 ? 1 : multiplier * 0.9));
    const adjusted = multiplier === 1 ? w.balance : inflows - outflows;
    cum += adjusted;
    return { weekLabel: w.weekLabel, startDate: w.startDate, inflows: multiplier === 1 ? w.inflows : inflows, outflows: multiplier === 1 ? w.outflows : outflows, balance: multiplier === 1 ? w.balance : adjusted, cumulative: cum };
  });
}

const SCENARIOS: Record<Scenario, { label: string; color: string; multiplier: number }> = {
  base:       { label: "Base",       color: "text-blue-600",    multiplier: 1 },
  optimista:  { label: "Optimista",  color: "text-emerald-600", multiplier: 1.15 },
  pesimista:  { label: "Pesimista",  color: "text-red-600",     multiplier: 0.85 },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function LiquidityForecastTab() {
  const [scenario, setScenario] = useState<Scenario>("base");

  const weeks = useMemo(() => buildForecast(SCENARIOS[scenario].multiplier), [scenario]);

  const stats = useMemo(() => {
    const minCum = Math.min(...weeks.map(w => w.cumulative));
    const maxCum = Math.max(...weeks.map(w => w.cumulative));
    const deficitWeeks = weeks.filter(w => w.cumulative < 0).length;
    const totalInflows = weeks.reduce((s, w) => s + w.inflows, 0);
    const totalOutflows = weeks.reduce((s, w) => s + w.outflows, 0);
    return { minCum, maxCum, deficitWeeks, totalInflows, totalOutflows };
  }, [weeks]);

  const barMax = Math.max(...weeks.map(w => Math.max(w.inflows, w.outflows)));

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" /> Proyección de Liquidez
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Flujo de caja proyectado 30/60/90 días con simulador de escenarios</p>
        </div>
        <button onClick={() => exportToCSV(weeks.map(w => ({ semana: w.weekLabel, ingresos: w.inflows, egresos: w.outflows, saldo_semanal: w.balance, acumulado: w.cumulative })), `liquidez-${scenario}`)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Saldo inicial", value: fmt(OPENING_BALANCE), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", icon: Wallet },
          { label: "Mínimo acumulado", value: fmt(stats.minCum), color: stats.minCum < 0 ? "text-red-600" : "text-emerald-600", bg: stats.minCum < 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-emerald-50 dark:bg-emerald-950/30", icon: ArrowDown },
          { label: "Máximo acumulado", value: fmt(stats.maxCum), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: ArrowUp },
          { label: "Semanas en déficit", value: String(stats.deficitWeeks), color: stats.deficitWeeks > 0 ? "text-red-600" : "text-emerald-600", bg: stats.deficitWeeks > 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-emerald-50 dark:bg-emerald-950/30", icon: AlertTriangle },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-2xl p-4 flex items-start gap-3", bg)}>
            <Icon className={cn("h-5 w-5 mt-0.5", color)} />
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-muted">{label}</p>
              <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Scenario Selector */}
      <div className="flex flex-wrap gap-1 bg-gray-100 dark:bg-surface rounded-xl p-1 max-w-sm">
        {(Object.entries(SCENARIOS) as [Scenario, typeof SCENARIOS["base"]][]).map(([k, v]) => (
          <button key={k} onClick={() => setScenario(k)} className={cn("flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-colors", scenario === k ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm" : "text-gray-500 dark:text-muted hover:text-gray-700")}>{v.label}</button>
        ))}
      </div>

      {/* Deficit alert */}
      {stats.deficitWeeks > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 rounded-xl p-3 flex flex-wrap items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">Alerta: {stats.deficitWeeks} semana(s) con saldo negativo en escenario {SCENARIOS[scenario].label}</p>
            <p className="text-xs text-red-600/80">Considere adelantar cobros o postergar pagos a proveedores</p>
          </div>
        </div>
      )}

      {/* Visual bar chart */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-gray-700 dark:text-foreground">Ingresos vs Egresos semanales</h3>
        <div className="space-y-2">
          {weeks.map(w => (
            <div key={w.weekLabel} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="w-35 text-gray-500 dark:text-muted shrink-0 truncate">{w.weekLabel.split("(")[0]}</span>
              <div className="flex-1 flex flex-col gap-0.5">
                <div className="h-3 rounded-full bg-emerald-200 dark:bg-emerald-900/40" style={{ width: `${(w.inflows / barMax) * 100}%` }}><div className="h-full rounded-full bg-emerald-500" style={{ width: "100%" }} /></div>
                <div className="h-3 rounded-full bg-red-200 dark:bg-red-900/40" style={{ width: `${(w.outflows / barMax) * 100}%` }}><div className="h-full rounded-full bg-red-500" style={{ width: "100%" }} /></div>
              </div>
              <span className={cn("w-20 text-right font-bold", w.balance >= 0 ? "text-emerald-600" : "text-red-600")}>{w.balance >= 0 ? "+" : ""}{fmt(w.balance)}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-gray-400 mt-2">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Ingresos</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" /> Egresos</span>
        </div>
      </div>

      {/* Detailed table */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface"><th className="px-2 sm:px-4 py-2 sm:py-3">Semana</th><th className="px-2 sm:px-4 py-2 sm:py-3">Ingresos</th><th className="px-2 sm:px-4 py-2 sm:py-3">Egresos</th><th className="px-2 sm:px-4 py-2 sm:py-3">Saldo semanal</th><th className="px-2 sm:px-4 py-2 sm:py-3">Acumulado</th></tr></thead>
            <tbody>
              {weeks.map(w => (
                <tr key={w.weekLabel} className={cn("border-t border-gray-100 dark:border-card-border", w.cumulative < 0 && "bg-red-50/50 dark:bg-red-950/10")}>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-700 dark:text-foreground text-xs">{w.weekLabel}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-emerald-600 font-bold flex items-center gap-1"><ArrowUp className="h-3 w-3" />{fmt(w.inflows)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-red-600 font-bold"><span className="flex items-center gap-1"><ArrowDown className="h-3 w-3" />{fmt(w.outflows)}</span></td>
                  <td className={cn("px-2 sm:px-4 py-2 sm:py-3 font-extrabold", w.balance >= 0 ? "text-emerald-600" : "text-red-600")}>{w.balance >= 0 ? "+" : ""}{fmt(w.balance)}</td>
                  <td className={cn("px-2 sm:px-4 py-2 sm:py-3 font-extrabold", w.cumulative >= 0 ? "text-blue-600" : "text-red-600")}>{fmt(w.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-4 bg-gray-50 dark:bg-surface rounded-xl p-3 text-sm">
        <div><span className="text-gray-400">Total ingresos: </span><span className="font-extrabold text-emerald-600 flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" />{fmt(stats.totalInflows)}</span></div>
        <div><span className="text-gray-400">Total egresos: </span><span className="font-extrabold text-red-600 flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" />{fmt(stats.totalOutflows)}</span></div>
        <div><span className="text-gray-400">Neto: </span><span className={cn("font-extrabold", stats.totalInflows - stats.totalOutflows >= 0 ? "text-emerald-600" : "text-red-600")}>{fmt(stats.totalInflows - stats.totalOutflows)}</span></div>
      </div>
    </div>
  );
}
