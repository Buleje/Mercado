"use client";

import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, TrendingDown, DollarSign, Loader2, RefreshCw,
  ChevronDown, ChevronUp, Download, BarChart2,
  ArrowUpRight, ArrowDownRight, Minus,
} from "@buleje/design-system/icons";
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
  if (val > 0) return "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]";
  if (val < 0) return "text-[var(--data-error-500)] dark:text-red-400";
  return "text-[var(--text-tertiary)] dark:text-muted";
}
function deltaIcon(val: number) {
  if (val > 0) return <ArrowUpRight className="h-3.5 w-3.5" />;
  if (val < 0) return <ArrowDownRight className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
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

  // Carga datos REALES: una ventana de 6 meses (orders + expenses) y de ahí se
  // derivan tanto el resumen del mes seleccionado como el trend de 6 meses.
  // (Antes el trend usaba Math.random — ver buildMockMonths eliminado.)
  useEffect(() => {
    let active = true;
    setLoading(true);

    const TREND_MONTHS = 6;
    const rangeFrom = new Date(year, month - (TREND_MONTHS - 1), 1).toISOString().slice(0, 10);
    const rangeTo = new Date(year, month + 1, 0).toISOString().slice(0, 10);

    const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;
    const isIncome = (o: { status?: string }) => o.status === "entregado" || o.status === "confirmado";
    const ordKey = (o: { createdAt?: string }) => (o.createdAt ?? "").slice(0, 7);
    const expKey = (e: { date?: string; createdAt?: string }) => (e.date ?? e.createdAt ?? "").slice(0, 7);

    Promise.all([
      fetch(`/api/orders?from=${rangeFrom}&to=${rangeTo}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/expenses?from=${rangeFrom}&to=${rangeTo}`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([orders, expenses]) => {
      if (!active) return;
      const ordersArr: { createdAt?: string; status?: string; total?: number }[] = Array.isArray(orders) ? orders : [];
      const expArr: { date?: string; createdAt?: string; category?: string; amount?: number }[] = Array.isArray(expenses) ? expenses : [];

      // ── Trend REAL: bucket por mes (COGS estimado 55% del ingreso) ──
      const realMonths: MonthData[] = [];
      for (let i = TREND_MONTHS - 1; i >= 0; i--) {
        const d = new Date(year, month - i, 1);
        const y = d.getFullYear(), m = d.getMonth();
        const key = monthKey(y, m);
        const revenue = ordersArr.filter(o => ordKey(o) === key && isIncome(o)).reduce((s, o) => s + (o.total ?? 0), 0);
        const cogs = revenue * 0.55;
        const grossProfit = revenue - cogs;
        const monthExp = expArr.filter(e => expKey(e) === key).reduce((s, e) => s + (e.amount ?? 0), 0);
        const netProfit = grossProfit - monthExp;
        realMonths.push({
          label: buildMonthLabel(y, m),
          revenue, cogs, grossProfit, expenses: monthExp, netProfit,
          grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
          netMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
        });
      }
      setMonths(realMonths);

      // ── Resumen del mes seleccionado (con desglose de gastos por categoría) ──
      const selKey = monthKey(year, month);
      const revenue = ordersArr.filter(o => ordKey(o) === selKey && isIncome(o)).reduce((s, o) => s + (o.total ?? 0), 0);
      const cogs = revenue * 0.55;
      const grossProfit = revenue - cogs;
      const selExpenses = expArr.filter(e => expKey(e) === selKey);
      const totalExpenses = selExpenses.reduce((s, e) => s + (e.amount ?? 0), 0);
      const expMap: Record<string, number> = {};
      for (const e of selExpenses) {
        const c = e.category ?? "Otros";
        expMap[c] = (expMap[c] ?? 0) + (e.amount ?? 0);
      }
      const netProfit = grossProfit - totalExpenses;

      setSummary({
        period: `${MONTHS[month]} ${year}`,
        revenue, cogs, grossProfit, expenses: expMap, totalExpenses, netProfit,
        grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
        netMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
      });
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
    <div className="space-y-4">
      {/* Header estándar del panel. Antes era un div a mano con PageTitle, que
          se saltea el `font-display` de AdminModuleHeader: al lado de sus
          hermanos de Mi Plata se leía como otro producto. */}
      <AdminModuleHeader
        as="h2"
        title="Ganancias y pérdidas del mes"
        description="Cuánto entró, cuánto salió y cuánto quedó de ganancia"
        icon={DollarSign}
      >
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setTick(t => t + 1)} className="p-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4 text-[var(--text-secondary)] dark:text-muted" />
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Descargar
          </button>
      </AdminModuleHeader>

      {loading ? (
        <LoadingState />
      ) : summary ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            {[
              { label: "Ingresos Brutos", value: summary.revenue, delta: revDelta, icon: TrendingUp, color: "text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15" },
              { label: "Utilidad Bruta", value: summary.grossProfit, sub: `Margen ${Number(summary.grossMargin).toFixed(1)}%`, icon: BarChart2, color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
              { label: "Gastos Operativos", value: summary.totalExpenses, icon: TrendingDown, color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30" },
              { label: "Utilidad Neta", value: summary.netProfit, delta: profitDelta, sub: `Margen ${Number(summary.netMargin).toFixed(1)}%`, icon: DollarSign, color: summary.netProfit >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]", bg: summary.netProfit >= 0 ? "bg-primary/10 dark:bg-primary/15" : "bg-[var(--data-error-50)] dark:bg-red-950/30" },
            ].map(({ label, value, delta, sub, icon: Icon, color, bg }) => (
              <div key={label} className={cn("rounded-xl p-4", bg, "border border-transparent")}>
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", bg)}>
                  <Icon className={cn("h-5 w-5", color)} />
                </div>
                <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
                <p className={cn("text-xl font-extrabold", color)}>{fmt(value)}</p>
                {delta !== undefined && (
                  <span className={cn("text-xs font-bold flex items-center gap-0.5 mt-1", deltaColor(delta))}>
                    {deltaIcon(delta)} {pct(delta)} vs mes anterior
                  </span>
                )}
                {sub && <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-0.5">{sub}</p>}
              </div>
            ))}
          </div>

          {/* P&L Statement Table */}
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
            <div className="px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-between">
              <SectionTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm">
                Ganancias y Pérdidas — {summary.period}
              </SectionTitle>
              <span className={cn("text-xs font-bold px-3 py-1 rounded-full", summary.netProfit >= 0 ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-error-100)] text-[var(--data-error-500)]")}>
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
                  className="w-full flex items-center justify-between px-3 sm:px-6 py-3 text-sm text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[var(--text-tertiary)]">−</span>
                    <span className="font-semibold">Gastos Operativos</span>
                    <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">({Object.keys(summary.expenses).length} categorías)</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[var(--data-warning-500)]">{fmt(summary.totalExpenses)}</span>
                    {expandExpenses ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>
                {expandExpenses && (
                  <div className="bg-gray-50 dark:bg-surface/50">
                    {Object.entries(summary.expenses).length === 0 ? (
                      <p className="px-10 py-3 text-xs text-[var(--text-tertiary)] dark:text-muted italic">Sin gastos registrados en este período</p>
                    ) : Object.entries(summary.expenses).map(([cat, val]) => (
                      <div key={cat} className="flex items-center justify-between px-10 py-2.5 text-sm border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] last:border-0">
                        <span className="text-[var(--text-secondary)] dark:text-muted capitalize">{cat}</span>
                        <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(val)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <PLRow label="= Utilidad Neta" value={summary.netProfit} bold highlight={summary.netProfit >= 0 ? "green" : "red"} showPct pctOf={summary.revenue} large />
            </div>
          </div>

          {/* Trend Chart (last 6 months) */}
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-6">
            <SectionTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm mb-4 flex flex-wrap items-center gap-2">
              <BarChart2 className="h-4 w-4 text-primary" />
              Tendencia últimos 6 meses
            </SectionTitle>
            <div className="flex flex-wrap items-end gap-3 h-40">
              {months.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-full flex flex-col gap-0.5 justify-end" style={{ height: "120px" }}>
                    {/* Revenue bar */}
                    <div
                      className="w-full rounded-t-md bg-primary/10 dark:bg-primary/10 transition-all"
                      style={{ height: `${(m.revenue / maxRevenue) * 100}px` }}
                      title={`Ingresos: ${fmt(m.revenue)}`}
                    />
                    {/* Net profit overlay */}
                    <div
                      className={cn("w-full rounded-t-md transition-all", m.netProfit >= 0 ? "bg-primary/10" : "bg-[var(--data-error-500)]")}
                      style={{ height: `${(Math.abs(m.netProfit) / maxRevenue) * 100}px`, marginTop: "2px" }}
                      title={`Utilidad neta: ${fmt(m.netProfit)}`}
                    />
                  </div>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted truncate w-full text-center">{m.label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-3">
              <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] dark:text-muted"><span className="w-3 h-3 rounded bg-primary/10" /> Ingresos</span>
              <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] dark:text-muted"><span className="w-3 h-3 rounded bg-primary/10" /> Utilidad neta</span>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-10 text-center text-[var(--text-tertiary)] dark:text-muted">
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
    highlight === "blue" ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" :
    highlight === "green" ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" :
    highlight === "red" ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" :
    value < 0 ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" : "text-[var(--text-primary)] dark:text-[var(--text-primary)]";

  return (
    <div className={cn("flex items-center justify-between px-3 sm:px-6 py-3.5", bold && "bg-gray-50/70 dark:bg-surface/30")}>
      <div>
        <p className={cn("text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)]", bold && "font-bold", large && "text-base")}>{label}</p>
        {sub && <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-0.5">{sub}</p>}
      </div>
      <div className="text-right">
        <p className={cn("font-semibold", valueColor, bold && "font-extrabold", large && "text-lg")}>
          {fmt(Math.abs(value))}
        </p>
        {showPct && pctOf && pctOf > 0 && (
          <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{((Math.abs(value) / pctOf) * 100).toFixed(1)}% de ventas</p>
        )}
      </div>
    </div>
  );
}
