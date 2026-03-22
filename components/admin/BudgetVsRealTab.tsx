"use client";
import { useState, useMemo } from "react";
import { TrendingDown, AlertTriangle, CheckCircle, Download, X } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

/* ── types ──────────────────────────────────────────────────── */
type BudgetLine = {
  id: string;
  category: string;
  department: string;
  budgeted: number;
  actual: number;
  month: string;
};

const fmt = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

/* ── seed data ──────────────────────────────────────────────── */
const MONTHS = ["Ene 2025", "Feb 2025", "Mar 2025", "Abr 2025", "May 2025", "Jun 2025"];
const BUDGET_DATA: BudgetLine[] = [];

const DEPARTMENTS = [...new Set(BUDGET_DATA.map(b => b.department))];

/* ── component ──────────────────────────────────────────────── */
export default function BudgetVsRealTab() {
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("Jun 2025");
  const [deptFilter, setDeptFilter] = useState("all");
  const [alertFilter, setAlertFilter] = useState<"all" | "over" | "under" | "ok">("all");
  const [detail, setDetail] = useState<BudgetLine | null>(null);

  const filtered = useMemo(() => {
    return BUDGET_DATA.filter(b => {
      if (monthFilter && b.month !== monthFilter) return false;
      if (deptFilter !== "all" && b.department !== deptFilter) return false;
      if (search && !b.category.toLowerCase().includes(search.toLowerCase())) return false;
      const variance = ((b.actual - b.budgeted) / b.budgeted) * 100;
      if (alertFilter === "over" && variance <= 10) return false;
      if (alertFilter === "under" && variance >= -10) return false;
      if (alertFilter === "ok" && Math.abs(variance) > 10) return false;
      return true;
    });
  }, [search, monthFilter, deptFilter, alertFilter]);

  const totals = useMemo(() => {
    const budgeted = filtered.reduce((s, b) => s + b.budgeted, 0);
    const actual = filtered.reduce((s, b) => s + b.actual, 0);
    return { budgeted, actual, variance: actual - budgeted, pct: budgeted > 0 ? ((actual - budgeted) / budgeted) * 100 : 0 };
  }, [filtered]);

  const overBudgetCount = filtered.filter(b => ((b.actual - b.budgeted) / b.budgeted) * 100 > 10).length;
  const underBudgetCount = filtered.filter(b => ((b.actual - b.budgeted) / b.budgeted) * 100 < -10).length;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground">Presupuesto vs Real</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-1">Compara gastos presupuestados contra ejecución real por mes</p>
        </div>
        <button
          onClick={() => exportToCSV(filtered.map(b => ({ Categoría: b.category, Departamento: b.department, Presupuestado: b.budgeted, Real: b.actual, Variación: ((b.actual - b.budgeted) / b.budgeted * 100).toFixed(1) + "%" })), "presupuesto-vs-real")}
          className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 shadow-sm">
          <p className="text-xs text-gray-500 dark:text-muted font-semibold">Total presupuestado</p>
          <p className="text-xl font-extrabold text-gray-900 dark:text-foreground mt-1">{fmt(totals.budgeted)}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 shadow-sm">
          <p className="text-xs text-gray-500 dark:text-muted font-semibold">Total ejecutado</p>
          <p className="text-xl font-extrabold text-gray-900 dark:text-foreground mt-1">{fmt(totals.actual)}</p>
        </div>
        <div className={cn("bg-white dark:bg-card rounded-2xl border p-4 shadow-sm", totals.variance > 0 ? "border-red-200 dark:border-red-800" : "border-emerald-200 dark:border-emerald-800")}>
          <p className="text-xs text-gray-500 dark:text-muted font-semibold">Desviación</p>
          <p className={cn("text-xl font-extrabold mt-1", totals.variance > 0 ? "text-red-600" : "text-emerald-600")}>{totals.variance > 0 ? "+" : ""}{fmt(totals.variance)}</p>
          <p className={cn("text-xs font-bold", totals.pct > 0 ? "text-red-500" : "text-emerald-600")}>{fmtPct(totals.pct)}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 shadow-sm">
          <p className="text-xs text-gray-500 dark:text-muted font-semibold">Alertas</p>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <span className="text-red-600 font-extrabold text-lg">{overBudgetCount}</span>
            <span className="text-xs text-gray-400 dark:text-muted">sobre</span>
            <span className="text-emerald-600 font-extrabold text-lg">{underBudgetCount}</span>
            <span className="text-xs text-gray-400 dark:text-muted">bajo</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar categoría..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-900 dark:text-foreground text-sm outline-none focus:border-primary transition-colors w-48"
        />
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-900 dark:text-foreground text-sm outline-none focus:border-primary">
          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-900 dark:text-foreground text-sm outline-none focus:border-primary">
          <option value="all">Todos los dptos</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="flex rounded-xl border border-gray-200 dark:border-card-border overflow-hidden">
          {([["all", "Todos"], ["over", "Sobre"], ["under", "Bajo"], ["ok", "OK"]] as const).map(([val, lbl]) => (
            <button key={val} onClick={() => setAlertFilter(val)} className={cn("px-3 py-2 text-sm font-semibold transition-colors", alertFilter === val ? "bg-primary text-white" : "text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface")}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-surface border-b border-gray-200 dark:border-card-border">
                <th className="text-left px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted font-semibold">Categoría</th>
                <th className="text-left px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted font-semibold">Depto</th>
                <th className="text-right px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted font-semibold">Presupuesto</th>
                <th className="text-right px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted font-semibold">Real</th>
                <th className="text-right px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted font-semibold">Variación</th>
                <th className="text-center px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted font-semibold">Barra</th>
                <th className="text-center px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => {
                const variance = b.budgeted > 0 ? ((b.actual - b.budgeted) / b.budgeted) * 100 : 0;
                const pctUsed = b.budgeted > 0 ? Math.min((b.actual / b.budgeted) * 100, 150) : 0;
                const status = Math.abs(variance) <= 10 ? "ok" : variance > 10 ? "over" : "under";
                return (
                  <tr key={b.id} onClick={() => setDetail(b)} className="border-b border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface cursor-pointer transition-colors">
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-gray-900 dark:text-foreground">{b.category}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted">{b.department}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-mono text-gray-700 dark:text-foreground">{fmt(b.budgeted)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-mono font-bold text-gray-900 dark:text-foreground">{fmt(b.actual)}</td>
                    <td className={cn("px-2 sm:px-4 py-2 sm:py-3 text-right font-bold", status === "over" ? "text-red-600" : status === "under" ? "text-emerald-600" : "text-gray-500 dark:text-muted")}>{fmtPct(variance)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="w-full h-2.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", status === "over" ? "bg-red-500" : status === "under" ? "bg-emerald-500" : "bg-blue-500")} style={{ width: `${Math.min(pctUsed, 100)}%` }} />
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                      {status === "ok" && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold"><CheckCircle className="h-3 w-3" /> OK</span>}
                      {status === "over" && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-bold"><AlertTriangle className="h-3 w-3" /> Exceso</span>}
                      {status === "under" && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold"><TrendingDown className="h-3 w-3" /> Ahorro</span>}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-muted">No se encontraron líneas presupuestarias</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-gray-100 dark:border-card-border">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">{detail.category}</h3>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-3 sm:px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <div><p className="text-xs text-gray-500 dark:text-muted">Departamento</p><p className="font-bold text-gray-900 dark:text-foreground">{detail.department}</p></div>
                <div><p className="text-xs text-gray-500 dark:text-muted">Mes</p><p className="font-bold text-gray-900 dark:text-foreground">{detail.month}</p></div>
                <div><p className="text-xs text-gray-500 dark:text-muted">Presupuestado</p><p className="font-bold text-gray-900 dark:text-foreground">{fmt(detail.budgeted)}</p></div>
                <div><p className="text-xs text-gray-500 dark:text-muted">Real</p><p className="font-bold text-gray-900 dark:text-foreground">{fmt(detail.actual)}</p></div>
              </div>
              <div className={cn("rounded-xl p-4 text-center", detail.actual > detail.budgeted ? "bg-red-50 dark:bg-red-950/20" : "bg-emerald-50 dark:bg-emerald-950/20")}>
                <p className={cn("text-xl sm:text-2xl font-extrabold", detail.actual > detail.budgeted ? "text-red-600" : "text-emerald-600")}>{fmt(detail.actual - detail.budgeted)}</p>
                <p className="text-xs text-gray-500 dark:text-muted mt-1">{detail.actual > detail.budgeted ? "Sobregasto" : "Ahorro"} ({fmtPct(((detail.actual - detail.budgeted) / detail.budgeted) * 100)})</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
