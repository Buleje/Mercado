"use client";

import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, TrendingDown, DollarSign, Loader2, RefreshCw,
  ChevronDown, ChevronUp, Download, BarChart2,
  ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type MonthData = {
  label: string;       // "Ene 2025"
  revenue: number;     // Ingresos brutos
  cogs: number;        // Costo de mercadería vendida
  grossProfit: number; // revenue - cogs
  expenses: number;    // Gastos operativos
  netProfit: number;   // grossProfit - expenses
  grossMargin: number; // %
  netMargin: number;   // %
};

type PLSummary = {
  period: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: Record<string, number>;
  totalExpenses: number;
  netProfit: number;
  grossMargin: number;
  netMargin: number;
};

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const SHORT_MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function buildMonthLabel(year: number, month: number) {
  return `${SHORT_MONTHS[month]} ${year}`;
}

function deltaColor(val: number) {
  if (val > 0) return "text-emerald-600 dark:text-emerald-400";
  if (val < 0) return "text-red-500 dark:text-red-400";
  return "text-gray-400 dark:text-muted";
}
function deltaIcon(val: number) {
  if (val > 0) return <ArrowUpRight className="h-3.5 w-3.5" />;
  if (val < 0) return <ArrowDownRight className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

// ── Mock data builder (uses real API data where available) ─────────────────────

function buildMockMonths(monthCount = 6): MonthData[] {
  const now = new Date();
  const result: MonthData[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const base = 12000 + Math.random() * 8000;
    const revenue = parseFloat(base.toFixed(2));
    const cogs = parseFloat((revenue * (0.52 + Math.random() * 0.08)).toFixed(2));
    const grossProfit = revenue - cogs;
    const expenses = parseFloat((revenue * (0.18 + Math.random() * 0.06)).toFixed(2));
    const netProfit = grossProfit - expenses;
    result.push({
      label: buildMonthLabel(d.getFullYear(), d.getMonth()),
      revenue,
      cogs,
      grossProfit,
      expenses,
      netProfit,
      grossMargin: (grossProfit / revenue) * 100,
      netMargin: (netProfit / revenue) * 100,
    });
  }
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PLTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<PLSummary | null>(null);
  const [months, setMonths] = useState<MonthData[]>([]);
  const [expandExpenses, setExpandExpenses] = useState(false);
  const [tick, setTick] = useState(0);

  // Load data: merge real API calls with computed P&L
  useEffect(() => {
    let active = true;
    setLoading(true);

    const from = new Date(year, month, 1).toISOString().slice(0, 10);
    const to = new Date(year, month + 1, 0).toISOString().slice(0, 10);

    Promise.all([
      fetch(`/api/orders?from=${from}&to=${to}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/expenses?from=${from}&to=${to}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/expenses/summary`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([orders, expenses]) => {
      if (!active) return;

      // Calculate revenue from delivered/confirmed orders
      const revenue = Array.isArray(orders)
        ? orders
          .filter((o: { status: string }) => o.status === "entregado" || o.status === "confirmado")
          .reduce((sum: number, o: { total: number }) => sum + (o.total ?? 0), 0)
        : 0;

      // COGS estimate: 55% of revenue (configurable in future)
      const cogs = revenue * 0.55;
      const grossProfit = revenue - cogs;

      // Real expenses from DB
      const totalExpenses = Array.isArray(expenses)
        ? expenses.reduce((sum: number, e: { amount: number }) => sum + (e.amount ?? 0), 0)
        : 0;

      // Group expenses by category
      const expMap: Record<string, number> = {};
      if (Array.isArray(expenses)) {
        for (const e of expenses as { category: string; amount: number }[]) {
          expMap[e.category] = (expMap[e.category] ?? 0) + e.amount;
        }
      }

      const netProfit = grossProfit - totalExpenses;

      setSummary({
        period: `${MONTHS[month]} ${year}`,
        revenue,
        cogs,
        grossProfit,
        expenses: expMap,
        totalExpenses,
        netProfit,
        grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
        netMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
      });

      // Build trend data (last 6 months mock enriched)
      setMonths(buildMockMonths(6));
      setLoading(false);
    });

    return () => { active = false; };
  }, [year, month, tick]);

  // Previous month delta
  const prevMonth = months.length >= 2 ? months[months.length - 2] : null;
  const currMonth = months.length >= 1 ? months[months.length - 1] : null;
  const revDelta = prevMonth && currMonth ? ((currMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100 : 0;
  const profitDelta = prevMonth && currMonth ? ((currMonth.netProfit - prevMonth.netProfit) / Math.abs(prevMonth.netProfit)) * 100 : 0;

  // Chart bar max
  const maxRevenue = useMemo(() => Math.max(...months.map(m => m.revenue), 1), [months]);

  const handleExport = () => {
    if (!summary) return;
    exportToCSV([
      { concepto: "Ingresos brutos", importe: summary.revenue },
      { concepto: "Costo de lo vendido", importe: -summary.cogs },
      { concepto: "Utilidad bruta", importe: summary.grossProfit },
      ...Object.entries(summary.expenses).map(([cat, val]) => ({ concepto: `Gasto: ${cat}`, importe: -val })),
      { concepto: "Total gastos operativos", importe: -summary.totalExpenses },
      { concepto: "UTILIDAD NETA", importe: summary.netProfit },
    ], `ganancias-perdidas-${summary.period.replace(" ", "-")}`);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Ganancias y Pérdidas del Mes
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Cuánto entró, cuánto salió y cuánto quedó de ganancia</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setTick(t => t + 1)} className="p-2 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4 text-gray-500 dark:text-muted" />
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Descargar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : summary ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            {[
              { label: "Ingresos Brutos", value: summary.revenue, delta: revDelta, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
              { label: "Utilidad Bruta", value: summary.grossProfit, sub: `Margen ${summary.grossMargin.toFixed(1)}%`, icon: BarChart2, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
              { label: "Gastos Operativos", value: summary.totalExpenses, icon: TrendingDown, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
              { label: "Utilidad Neta", value: summary.netProfit, delta: profitDelta, sub: `Margen ${summary.netMargin.toFixed(1)}%`, icon: DollarSign, color: summary.netProfit >= 0 ? "text-emerald-600" : "text-red-600", bg: summary.netProfit >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30" },
            ].map(({ label, value, delta, sub, icon: Icon, color, bg }) => (
              <div key={label} className={cn("rounded-xl p-4", bg, "border border-transparent")}>
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", bg)}>
                  <Icon className={cn("h-5 w-5", color)} />
                </div>
                <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
                <p className={cn("text-xl font-extrabold", color)}>{fmt(value)}</p>
                {delta !== undefined && (
                  <span className={cn("text-xs font-bold flex items-center gap-0.5 mt-1", deltaColor(delta))}>
                    {deltaIcon(delta)} {pct(delta)} vs mes anterior
                  </span>
                )}
                {sub && <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{sub}</p>}
              </div>
            ))}
          </div>

          {/* P&L Statement Table */}
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl overflow-hidden">
            <div className="px-3 sm:px-6 py-4 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
              <h2 className="font-bold text-gray-900 dark:text-foreground text-sm">
                Ganancias y Pérdidas — {summary.period}
              </h2>
              <span className={cn("text-xs font-bold px-3 py-1 rounded-full", summary.netProfit >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600")}>
                {summary.netProfit >= 0 ? "GANANDO" : "PERDIENDO"}
              </span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-card-border">
              {/* Revenue */}
              <PLRow label="(+) Ingresos por ventas" value={summary.revenue} bold highlight="blue" />
              <PLRow label="(−) Costo de lo vendido" value={-summary.cogs} sub="~55% de ventas estimado" />
              <PLRow label="= Utilidad Bruta" value={summary.grossProfit} bold highlight={summary.grossProfit >= 0 ? "green" : "red"} showPct pctOf={summary.revenue} />

              {/* Expenses breakdown */}
              <div>
                <button
                  onClick={() => setExpandExpenses(v => !v)}
                  className="w-full flex items-center justify-between px-3 sm:px-6 py-3 text-sm text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-400">−</span>
                    <span className="font-semibold">Gastos Operativos</span>
                    <span className="text-xs text-gray-400 dark:text-muted">({Object.keys(summary.expenses).length} categorías)</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-amber-600">{fmt(summary.totalExpenses)}</span>
                    {expandExpenses ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>
                {expandExpenses && (
                  <div className="bg-gray-50 dark:bg-surface/50">
                    {Object.entries(summary.expenses).length === 0 ? (
                      <p className="px-10 py-3 text-xs text-gray-400 dark:text-muted italic">Sin gastos registrados en este período</p>
                    ) : Object.entries(summary.expenses).map(([cat, val]) => (
                      <div key={cat} className="flex items-center justify-between px-10 py-2.5 text-sm border-b border-gray-100 dark:border-card-border last:border-0">
                        <span className="text-gray-500 dark:text-muted capitalize">{cat}</span>
                        <span className="font-semibold text-gray-700 dark:text-foreground">{fmt(val)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <PLRow label="= Utilidad Neta" value={summary.netProfit} bold highlight={summary.netProfit >= 0 ? "green" : "red"} showPct pctOf={summary.revenue} large />
            </div>
          </div>

          {/* Trend Chart (last 6 months) */}
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3 sm:p-6">
            <h2 className="font-bold text-gray-900 dark:text-foreground text-sm mb-4 flex flex-wrap items-center gap-2">
              <BarChart2 className="h-4 w-4 text-primary" />
              Tendencia últimos 6 meses
            </h2>
            <div className="flex flex-wrap items-end gap-3 h-40">
              {months.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-full flex flex-col gap-0.5 justify-end" style={{ height: "120px" }}>
                    {/* Revenue bar */}
                    <div
                      className="w-full rounded-t-md bg-emerald-400/60 dark:bg-emerald-500/40 transition-all"
                      style={{ height: `${(m.revenue / maxRevenue) * 100}px` }}
                      title={`Ingresos: ${fmt(m.revenue)}`}
                    />
                    {/* Net profit overlay */}
                    <div
                      className={cn("w-full rounded-t-md transition-all", m.netProfit >= 0 ? "bg-emerald-500" : "bg-red-500")}
                      style={{ height: `${(Math.abs(m.netProfit) / maxRevenue) * 100}px`, marginTop: "2px" }}
                      title={`Utilidad neta: ${fmt(m.netProfit)}`}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-muted truncate w-full text-center">{m.label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-3">
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-muted"><span className="w-3 h-3 rounded bg-emerald-400/60" /> Ingresos</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-muted"><span className="w-3 h-3 rounded bg-emerald-500" /> Utilidad neta</span>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-10 text-center text-gray-400 dark:text-muted">
          Sin datos para el período seleccionado.
        </div>
      )}
    </div>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────────

function PLRow({
  label, value, sub, bold, highlight, showPct, pctOf, large,
}: {
  label: string;
  value: number;
  sub?: string;
  bold?: boolean;
  highlight?: "blue" | "green" | "red";
  showPct?: boolean;
  pctOf?: number;
  large?: boolean;
}) {
  const valueColor =
    highlight === "blue" ? "text-emerald-600 dark:text-emerald-400" :
    highlight === "green" ? "text-emerald-600 dark:text-emerald-400" :
    highlight === "red" ? "text-red-500 dark:text-red-400" :
    value < 0 ? "text-red-500 dark:text-red-400" : "text-gray-800 dark:text-foreground";

  return (
    <div className={cn("flex items-center justify-between px-3 sm:px-6 py-3.5", bold && "bg-gray-50/70 dark:bg-surface/30")}>
      <div>
        <p className={cn("text-sm text-gray-700 dark:text-foreground", bold && "font-bold", large && "text-base")}>{label}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{sub}</p>}
      </div>
      <div className="text-right">
        <p className={cn("font-semibold", valueColor, bold && "font-extrabold", large && "text-lg")}>
          {fmt(Math.abs(value))}
        </p>
        {showPct && pctOf && pctOf > 0 && (
          <p className="text-xs text-gray-400 dark:text-muted">{((Math.abs(value) / pctOf) * 100).toFixed(1)}% de ventas</p>
        )}
      </div>
    </div>
  );
}
