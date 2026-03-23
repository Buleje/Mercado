"use client";
import { useState, useEffect, useMemo } from "react";
import { TrendingDown, AlertTriangle, CheckCircle, Download, Loader2, RefreshCw } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

/* ── Types ──────────────────────────────────────────────────── */
type ExpenseItem = {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  recurring: boolean;
};

type BudgetLine = {
  id: string;
  category: string;
  department: string;
  budgeted: number;
  actual: number;
  month: string;
};

/* ── Helpers ─────────────────────────────────────────────────── */
const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const MONTH_LABELS: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

function monthLabel(iso: string) {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${MONTH_LABELS[m] ?? m} ${y}`;
}

// Agrupa gastos reales por categoría y mes
function buildBudgetLines(expenses: ExpenseItem[]): BudgetLine[] {
  const map = new Map<string, BudgetLine>();
  expenses.forEach((e) => {
    const month = monthLabel(e.date);
    const key = `${e.category}__${month}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        category: e.category,
        department: inferDept(e.category),
        budgeted: estimateBudget(e.category),
        actual: 0,
        month,
      });
    }
    map.get(key)!.actual += e.amount;
  });
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

function inferDept(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes("compra") || c.includes("inventar") || c.includes("product")) return "Operaciones";
  if (c.includes("nómina") || c.includes("sueldo") || c.includes("personal")) return "RRHH";
  if (c.includes("alquiler") || c.includes("local")) return "Administración";
  if (c.includes("transport") || c.includes("flete")) return "Logística";
  if (c.includes("market") || c.includes("publicidad")) return "Marketing";
  return "General";
}

function estimateBudget(cat: string): number {
  const c = cat.toLowerCase();
  if (c.includes("compra") || c.includes("inventar")) return 8000;
  if (c.includes("nómina") || c.includes("sueldo")) return 5000;
  if (c.includes("alquiler")) return 1500;
  if (c.includes("transport")) return 800;
  if (c.includes("market")) return 600;
  return 1000;
}

/* ── Component ───────────────────────────────────────────────── */
export default function BudgetVsRealTab() {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [alertFilter, setAlertFilter] = useState<"all" | "over" | "under" | "ok">("all");

  const load = () => {
    setLoading(true);
    setError(false);
    fetch("/api/expenses")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: ExpenseItem[]) => {
        setExpenses(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const lines = useMemo(() => buildBudgetLines(expenses), [expenses]);

  const MONTHS = useMemo(() => ["all", ...new Set(lines.map((b) => b.month))], [lines]);
  const DEPARTMENTS = useMemo(() => [...new Set(lines.map((b) => b.department))], [lines]);

  // Mes más reciente por defecto
  useEffect(() => {
    if (MONTHS.length > 1 && monthFilter === "all") {
      setMonthFilter(MONTHS[MONTHS.length - 1]);
    }
  }, [MONTHS, monthFilter]);

  const filtered = useMemo(() => {
    return lines.filter((b) => {
      if (monthFilter !== "all" && b.month !== monthFilter) return false;
      if (deptFilter !== "all" && b.department !== deptFilter) return false;
      if (search && !b.category.toLowerCase().includes(search.toLowerCase())) return false;
      const variance = b.budgeted > 0 ? ((b.actual - b.budgeted) / b.budgeted) * 100 : 0;
      if (alertFilter === "over" && variance <= 10) return false;
      if (alertFilter === "under" && variance >= -10) return false;
      if (alertFilter === "ok" && Math.abs(variance) > 10) return false;
      return true;
    });
  }, [lines, search, monthFilter, deptFilter, alertFilter]);

  const totals = useMemo(() => {
    const budgeted = filtered.reduce((s, b) => s + b.budgeted, 0);
    const actual = filtered.reduce((s, b) => s + b.actual, 0);
    return {
      budgeted,
      actual,
      variance: actual - budgeted,
      pct: budgeted > 0 ? ((actual - budgeted) / budgeted) * 100 : 0,
    };
  }, [filtered]);

  const overBudgetCount = filtered.filter(
    (b) => b.budgeted > 0 && ((b.actual - b.budgeted) / b.budgeted) * 100 > 10
  ).length;
  const underBudgetCount = filtered.filter(
    (b) => b.budgeted > 0 && ((b.actual - b.budgeted) / b.budgeted) * 100 < -10
  ).length;

  // Datos para gráfico de barras por categoría (top 8)
  const chartData = useMemo(() => {
    return [...filtered]
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 8);
  }, [filtered]);
  const chartMax = useMemo(
    () => Math.max(...chartData.map((b) => Math.max(b.budgeted, b.actual)), 1),
    [chartData]
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-gray-500 dark:text-muted">Cargando gastos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <p className="text-gray-500 dark:text-muted text-sm">Error cargando datos de gastos</p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground">
            Presupuesto vs Real
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-1">
            Compara gastos presupuestados contra ejecución real ({expenses.length} registros)
          </p>
        </div>
        <button
          onClick={() =>
            exportToCSV(
              filtered.map((b) => ({
                Categoría: b.category,
                Departamento: b.department,
                Mes: b.month,
                Presupuestado: b.budgeted,
                Real: b.actual,
                Variación:
                  b.budgeted > 0
                    ? fmtPct(((b.actual - b.budgeted) / b.budgeted) * 100)
                    : "N/A",
              })),
              "presupuesto-vs-real"
            )
          }
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 shadow-sm">
          <p className="text-xs text-gray-500 dark:text-muted font-semibold">Total presupuestado</p>
          <p className="text-xl font-extrabold text-gray-900 dark:text-foreground mt-1">
            {fmt(totals.budgeted)}
          </p>
        </div>
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 shadow-sm">
          <p className="text-xs text-gray-500 dark:text-muted font-semibold">Total ejecutado</p>
          <p className="text-xl font-extrabold text-gray-900 dark:text-foreground mt-1">
            {fmt(totals.actual)}
          </p>
        </div>
        <div
          className={cn(
            "bg-white dark:bg-card rounded-2xl border p-4 shadow-sm",
            totals.variance > 0
              ? "border-red-200 dark:border-red-800"
              : "border-emerald-200 dark:border-emerald-800"
          )}
        >
          <p className="text-xs text-gray-500 dark:text-muted font-semibold">Desviación</p>
          <p
            className={cn(
              "text-xl font-extrabold mt-1",
              totals.variance > 0 ? "text-red-600" : "text-emerald-600"
            )}
          >
            {totals.variance > 0 ? "+" : ""}
            {fmt(totals.variance)}
          </p>
          <p
            className={cn(
              "text-xs font-bold",
              totals.pct > 0 ? "text-red-500" : "text-emerald-600"
            )}
          >
            {fmtPct(totals.pct)}
          </p>
        </div>
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 shadow-sm">
          <p className="text-xs text-gray-500 dark:text-muted font-semibold">Alertas</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-red-600 font-extrabold text-lg">{overBudgetCount}</span>
            <span className="text-xs text-gray-400 dark:text-muted">sobre</span>
            <span className="text-emerald-600 font-extrabold text-lg">{underBudgetCount}</span>
            <span className="text-xs text-gray-400 dark:text-muted">bajo</span>
          </div>
        </div>
      </div>

      {/* Gráfico de barras comparativo */}
      {chartData.length > 0 && (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-4">
            Presupuesto vs Real por categoría (top {chartData.length})
          </h3>
          <div className="space-y-3">
            {chartData.map((b) => {
              const variance =
                b.budgeted > 0 ? ((b.actual - b.budgeted) / b.budgeted) * 100 : 0;
              const isOver = variance > 10;
              const isUnder = variance < -10;
              return (
                <div key={b.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-700 dark:text-foreground truncate max-w-[150px]">
                      {b.category}
                    </span>
                    <span
                      className={cn(
                        "font-bold",
                        isOver ? "text-red-600" : isUnder ? "text-emerald-600" : "text-gray-500"
                      )}
                    >
                      {fmtPct(variance)}
                    </span>
                  </div>
                  {/* Barra presupuesto */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-16 shrink-0">Presup.</span>
                    <div className="flex-1 h-3 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-300 dark:bg-blue-700"
                        style={{ width: `${(b.budgeted / chartMax) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500 w-20 text-right">{fmt(b.budgeted)}</span>
                  </div>
                  {/* Barra real */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-16 shrink-0">Real</span>
                    <div className="flex-1 h-3 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          isOver ? "bg-red-500" : isUnder ? "bg-emerald-500" : "bg-primary"
                        )}
                        style={{ width: `${Math.min((b.actual / chartMax) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-gray-700 dark:text-foreground w-20 text-right">
                      {fmt(b.actual)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 rounded bg-blue-300 dark:bg-blue-700" /> Presupuestado
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 rounded bg-primary" /> Real (OK)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 rounded bg-red-500" /> Real (exceso)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 rounded bg-emerald-500" /> Real (ahorro)
            </span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-900 dark:text-foreground text-sm outline-none focus:border-primary transition-colors w-48"
        />
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-900 dark:text-foreground text-sm outline-none focus:border-primary"
        >
          <option value="all">Todos los meses</option>
          {MONTHS.filter((m) => m !== "all").map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-900 dark:text-foreground text-sm outline-none focus:border-primary"
        >
          <option value="all">Todos los dptos</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <div className="flex rounded-xl border border-gray-200 dark:border-card-border overflow-hidden">
          {(
            [
              ["all", "Todos"],
              ["over", "Exceso"],
              ["under", "Ahorro"],
              ["ok", "OK"],
            ] as const
          ).map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setAlertFilter(val)}
              className={cn(
                "px-3 py-2 text-sm font-semibold transition-colors",
                alertFilter === val
                  ? "bg-primary text-white"
                  : "text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
              )}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-surface border-b border-gray-200 dark:border-card-border">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-muted font-semibold">Categoría</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-muted font-semibold">Depto</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-muted font-semibold">Mes</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-muted font-semibold">Presupuesto</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-muted font-semibold">Real</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-muted font-semibold">Variación</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-muted font-semibold">Barra</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-muted font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const variance =
                  b.budgeted > 0 ? ((b.actual - b.budgeted) / b.budgeted) * 100 : 0;
                const pctUsed = b.budgeted > 0 ? Math.min((b.actual / b.budgeted) * 100, 150) : 0;
                const status =
                  Math.abs(variance) <= 10 ? "ok" : variance > 10 ? "over" : "under";
                return (
                  <tr
                    key={b.id}
                    className="border-b border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-foreground">
                      {b.category}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-muted">{b.department}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 dark:text-muted">{b.month}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-foreground">
                      {fmt(b.budgeted)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-gray-900 dark:text-foreground">
                      {fmt(b.actual)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-bold",
                        status === "over"
                          ? "text-red-600"
                          : status === "under"
                          ? "text-emerald-600"
                          : "text-gray-500 dark:text-muted"
                      )}
                    >
                      {fmtPct(variance)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-full h-2.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            status === "over"
                              ? "bg-red-500"
                              : status === "under"
                              ? "bg-emerald-500"
                              : "bg-blue-500"
                          )}
                          style={{ width: `${Math.min(pctUsed, 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {status === "ok" && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                          <CheckCircle className="h-3 w-3" /> OK
                        </span>
                      )}
                      {status === "over" && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-bold">
                          <AlertTriangle className="h-3 w-3" /> Exceso
                        </span>
                      )}
                      {status === "under" && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold">
                          <TrendingDown className="h-3 w-3" /> Ahorro
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-muted">
                    {expenses.length === 0
                      ? "No hay gastos registrados aún. Registra gastos en el módulo de Egresos."
                      : "No se encontraron líneas con los filtros seleccionados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
