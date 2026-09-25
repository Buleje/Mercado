"use client";
import { CardTitle, DataTable, LoadingState, SectionTitle } from "@buleje/design-system";
import { Field } from "@/components/admin/shared/Field";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  TrendingDown, TrendingUp, AlertTriangle, CheckCircle,
  Download, RefreshCw, Target, Save,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { FiltroColumna } from "@/components/admin/shared/filtros-columna";
import type { FacetaOpcion } from "@/lib/admin/filtros-columna";

/* ── Types ──────────────────────────────────────────────────── */
type ExpenseItem = {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  recurring: boolean;
};

type SaleItem = {
  id: string;
  total: number;
  createdAt: string;
};

type BudgetLine = {
  id: string;
  category: string;
  department: string;
  budgeted: number;
  actual: number;
  month: string;
};

type BudgetConfig = {
  month: string; // "YYYY-MM"
  salesGoal: number;
  expensesGoal: number;
};

/* ── Helpers ─────────────────────────────────────────────────── */
const fmt = (n: number) =>
  `${formatCurrency(n)}`;
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const ESTADOS = [
  { value: "over", label: "Exceso" },
  { value: "under", label: "Ahorro" },
  { value: "ok", label: "OK" },
] as const;

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

function currentYearMonth() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${m}`;
}

function dayOfMonth() {
  return new Date().getDate();
}

function daysInMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

// Carga config desde localStorage
function loadBudgetConfig(ym: string): BudgetConfig {
  try {
    const raw = localStorage.getItem("bodega-budget-config");
    if (!raw) return { month: ym, salesGoal: 0, expensesGoal: 0 };
    const parsed: BudgetConfig = JSON.parse(raw);
    if (parsed.month === ym) return parsed;
  } catch { /* noop */ }
  return { month: ym, salesGoal: 0, expensesGoal: 0 };
}

function saveBudgetConfig(cfg: BudgetConfig) {
  localStorage.setItem("bodega-budget-config", JSON.stringify(cfg));
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

/* ── Barra de progreso con semáforo ─────────────────────────── */
function ProgressBar({
  label, current, goal, isSales,
}: {
  label: string;
  current: number;
  goal: number;
  isSales: boolean;
}) {
  const pct = goal > 0 ? (current / goal) * 100 : 0;
  const display = Math.min(pct, 100);

  // Para ventas: verde >80%, amarillo 50-80%, rojo <50%
  // Para gastos: verde <80%, amarillo 80-100%, rojo >100%
  let color = "bg-primary/10";
  let textColor = "text-[var(--data-success-500)]";
  let bgLight = "bg-primary/10";
  if (isSales) {
    if (pct >= 80) { color = "bg-primary/10"; textColor = "text-[var(--data-success-500)]"; bgLight = "bg-primary/10"; }
    else if (pct >= 50) { color = "bg-amber-400"; textColor = "text-[var(--data-warning-600)]"; bgLight = "bg-amber-100"; }
    else { color = "bg-[var(--data-error-500)]"; textColor = "text-[var(--data-error-600)]"; bgLight = "bg-red-100"; }
  } else {
    if (pct < 80) { color = "bg-primary/10"; textColor = "text-[var(--data-success-500)]"; bgLight = "bg-primary/10"; }
    else if (pct <= 100) { color = "bg-amber-400"; textColor = "text-[var(--data-warning-600)]"; bgLight = "bg-amber-100"; }
    else { color = "bg-[var(--data-error-500)]"; textColor = "text-[var(--data-error-600)]"; bgLight = "bg-red-100"; }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
        <span className={cn("text-sm font-bold", textColor)}>
          {pct.toFixed(0)}% {isSales ? "logrado" : "utilizado"}
        </span>
      </div>
      <div className="w-full h-4 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-[var(--dur-slow)]", color)}
          style={{ width: `${display}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={cn("font-bold px-2 py-0.5 rounded-full", bgLight, textColor)}>
          Llevas {fmt(current)} de {fmt(goal)}
        </span>
        {goal > 0 && (
          <span className="text-[var(--text-tertiary)]">
            {isSales ? `Falta ${fmt(Math.max(goal - current, 0))}` : `Queda ${fmt(Math.max(goal - current, 0))}`}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Gráfico de barras por categoría (SVG-free, solo divs) ─── */
function CategoryChart({
  categories,
}: {
  categories: { label: string; budgeted: number; actual: number }[];
}) {
  const max = Math.max(...categories.flatMap((c) => [c.budgeted, c.actual]), 1);
  return (
    <div className="space-y-6">
      {categories.map((c) => {
        const variance = c.budgeted > 0 ? ((c.actual - c.budgeted) / c.budgeted) * 100 : 0;
        const isOver = variance > 10;
        const isUnder = variance < -10;
        return (
          <div key={c.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-primary)] truncate max-w-[140px] sm:max-w-none">
                {c.label}
              </span>
              <span className={cn("font-bold", isOver ? "text-[var(--data-error-500)]" : isUnder ? "text-[var(--data-success-500)]" : "text-[var(--text-secondary)]")}>
                {fmtPct(variance)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] w-14 shrink-0">Presup.</span>
              <div className="flex-1 h-3 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/10"
                  style={{ width: `${(c.budgeted / max) * 100}%` }}
                />
              </div>
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] w-20 text-right shrink-0">{fmt(c.budgeted)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] w-14 shrink-0">Real</span>
              <div className="flex-1 h-3 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full", isOver ? "bg-[var(--data-error-500)]" : isUnder ? "bg-primary/10" : "bg-primary")}
                  style={{ width: `${Math.min((c.actual / max) * 100, 100)}%` }}
                />
              </div>
              <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)] w-20 text-right shrink-0">
                {fmt(c.actual)}
              </span>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-[var(--text-tertiary)]">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-primary/10" /> Presupuestado</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-primary" /> Real (OK)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-[var(--data-error-500)]" /> Real (exceso)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-primary/10" /> Real (ahorro)</span>
      </div>
    </div>
  );
}

/* ── Component ───────────────────────────────────────────────── */
export default function BudgetVsRealTab() {
  const ym = currentYearMonth();

  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [sales, setSales] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  /** Depto y Estado: ahora en el `<th>` de su columna (convención de filtros
   *  en la cabecera) — vivían como un `<select>` y un grupo de botones sueltos. */
  const [deptFilter, setDeptFilter] = useState<string | undefined>(undefined);
  const [alertFilter, setAlertFilter] = useState<string | undefined>(undefined);
  /** `true` en cuanto el usuario toca el filtro de Mes — antes de eso, el
   *  default de "último mes" se puede reponer; después, "Limpiar" (volver a
   *  "Todos los meses") debe quedarse así, no reponer el último mes solo. */
  const [monthTouched, setMonthTouched] = useState(false);

  // Config de presupuesto
  const [budgetConfig, setBudgetConfig] = useState<BudgetConfig>({ month: ym, salesGoal: 0, expensesGoal: 0 });
  const [formSalesGoal, setFormSalesGoal] = useState("");
  const [formExpensesGoal, setFormExpensesGoal] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const cfg = loadBudgetConfig(ym);
    setBudgetConfig(cfg);
    setFormSalesGoal(cfg.salesGoal > 0 ? String(cfg.salesGoal) : "");
    setFormExpensesGoal(cfg.expensesGoal > 0 ? String(cfg.expensesGoal) : "");
  }, [ym]);

  const handleSaveConfig = () => {
    const cfg: BudgetConfig = {
      month: ym,
      salesGoal: parseFloat(formSalesGoal) || 0,
      expensesGoal: parseFloat(formExpensesGoal) || 0,
    };
    saveBudgetConfig(cfg);
    setBudgetConfig(cfg);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [expRes, salesRes] = await Promise.all([
        fetch("/api/expenses"),
        fetch("/api/sales"),
      ]);
      const expData: ExpenseItem[] = expRes.ok ? await expRes.json() : [];
      const salesData: SaleItem[] = salesRes.ok ? await salesRes.json() : [];
      setExpenses(Array.isArray(expData) ? expData : []);
      setSales(Array.isArray(salesData) ? salesData : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Ventas del mes actual
  const currentMonthSales = useMemo(() => {
    return sales
      .filter((s) => s.createdAt?.startsWith(ym))
      .reduce((sum, s) => sum + (s.total ?? 0), 0);
  }, [sales, ym]);

  // Gastos del mes actual
  const currentMonthExpenses = useMemo(() => {
    return expenses
      .filter((e) => e.date?.startsWith(ym))
      .reduce((sum, e) => sum + (e.amount ?? 0), 0);
  }, [expenses, ym]);

  // Proyección fin de mes
  const projection = useMemo(() => {
    const day = dayOfMonth();
    const total = daysInMonth();
    if (day === 0) return { sales: 0, expenses: 0 };
    return {
      sales: (currentMonthSales / day) * total,
      expenses: (currentMonthExpenses / day) * total,
    };
  }, [currentMonthSales, currentMonthExpenses]);

  const lines = useMemo(() => buildBudgetLines(expenses), [expenses]);

  const MONTHS = useMemo(() => ["all", ...new Set(lines.map((b) => b.month))], [lines]);
  const DEPARTMENTS = useMemo(() => [...new Set(lines.map((b) => b.department))], [lines]);

  // Default a "el último mes" SOLO antes de que el usuario toque el filtro —
  // si no, "Limpiar" (que pone monthFilter en "all") quedaba reemplazado por
  // el último mes en cada render y nunca se veían "Todos los meses" juntos.
  useEffect(() => {
    if (!monthTouched && MONTHS.length > 1) setMonthFilter(MONTHS[MONTHS.length - 1]);
  }, [MONTHS, monthTouched]);
  const effectiveMonthFilter = monthFilter;
  const handleMonthFilterChange = (v: string | undefined) => {
    setMonthTouched(true);
    setMonthFilter(v ?? "all");
  };

  const filtered = useMemo(() => {
    return lines.filter((b) => {
      if (effectiveMonthFilter !== "all" && b.month !== effectiveMonthFilter) return false;
      if (deptFilter && b.department !== deptFilter) return false;
      if (search && !b.category.toLowerCase().includes(search.toLowerCase())) return false;
      const variance = b.budgeted > 0 ? ((b.actual - b.budgeted) / b.budgeted) * 100 : 0;
      if (alertFilter === "over" && variance <= 10) return false;
      if (alertFilter === "under" && variance >= -10) return false;
      if (alertFilter === "ok" && Math.abs(variance) > 10) return false;
      return true;
    });
  }, [lines, search, effectiveMonthFilter, deptFilter, alertFilter]);

  // Peso de cada opción sobre TODAS las líneas del mes/depto elegido (Excel:
  // el propio filtro no se recorta a sí mismo). Mes usa `effectiveMonthFilter`
  // porque esa es la ventana real que ve la tabla.
  const monthOptions = useMemo<FacetaOpcion[]>(() => {
    const counts: Record<string, number> = {};
    for (const b of lines) counts[b.month] = (counts[b.month] ?? 0) + 1;
    return MONTHS.filter((m) => m !== "all").map((m) => ({ value: m, count: counts[m] ?? 0 }));
  }, [lines, MONTHS]);
  const deptOptions = useMemo<FacetaOpcion[]>(() => {
    const counts: Record<string, number> = {};
    for (const b of lines) {
      if (effectiveMonthFilter !== "all" && b.month !== effectiveMonthFilter) continue;
      counts[b.department] = (counts[b.department] ?? 0) + 1;
    }
    return DEPARTMENTS.map((d) => ({ value: d, count: counts[d] ?? 0 }));
  }, [lines, DEPARTMENTS, effectiveMonthFilter]);
  const estadoOptions = useMemo<FacetaOpcion[]>(() => {
    const counts: Record<string, number> = { over: 0, under: 0, ok: 0 };
    for (const b of lines) {
      if (effectiveMonthFilter !== "all" && b.month !== effectiveMonthFilter) continue;
      if (deptFilter && b.department !== deptFilter) continue;
      const variance = b.budgeted > 0 ? ((b.actual - b.budgeted) / b.budgeted) * 100 : 0;
      const key = Math.abs(variance) <= 10 ? "ok" : variance > 10 ? "over" : "under";
      counts[key] += 1;
    }
    return ESTADOS.filter((e) => counts[e.value] > 0).map((e) => ({ value: e.value, count: counts[e.value] }));
  }, [lines, effectiveMonthFilter, deptFilter]);

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

  // Categorías principales para el gráfico (top 6)
  const mainCategories = useMemo(() => {
    const salesTotal = currentMonthSales;
    const expTotal = currentMonthExpenses;
    const netProfit = salesTotal - expTotal;

    const expensesByDept: Record<string, { budgeted: number; actual: number }> = {};
    lines
      .filter((b) => b.month === (MONTHS[MONTHS.length - 1] ?? ""))
      .forEach((b) => {
        if (!expensesByDept[b.department]) expensesByDept[b.department] = { budgeted: 0, actual: 0 };
        expensesByDept[b.department].budgeted += b.budgeted;
        expensesByDept[b.department].actual += b.actual;
      });

    const cats = [
      { label: "Ventas", budgeted: budgetConfig.salesGoal, actual: salesTotal },
      { label: "Gastos totales", budgeted: budgetConfig.expensesGoal, actual: expTotal },
      { label: "Ganancia neta", budgeted: Math.max(budgetConfig.salesGoal - budgetConfig.expensesGoal, 0), actual: netProfit },
      ...Object.entries(expensesByDept)
        .sort((a, b) => b[1].actual - a[1].actual)
        .slice(0, 3)
        .map(([dept, v]) => ({ label: dept, budgeted: v.budgeted, actual: v.actual })),
    ];
    return cats;
  }, [lines, currentMonthSales, currentMonthExpenses, budgetConfig, MONTHS]);

  if (loading) {
    return (
      <LoadingState message="Cargando datos..." />
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-10 w-10 text-[var(--data-error-500)]" />
        <p className="text-[var(--text-secondary)] text-sm">Error cargando datos</p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 min-h-10 rounded-xl bg-primary text-white text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    );
  }

  const monthName = MONTH_LABELS[ym.split("-")[1]] ?? "";
  const yearNum = ym.split("-")[0];
  const day = dayOfMonth();
  const totalDays = daysInMonth();

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <SectionTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
            Meta vs Real
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {monthName} {yearNum} · Día {day} de {totalDays}
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
                Variación: b.budgeted > 0 ? fmtPct(((b.actual - b.budgeted) / b.budgeted) * 100) : "N/A",
              })),
              "meta-vs-real"
            )
          }
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* ── 1. Configurador de metas mensuales ── */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">
            Mis metas de {monthName} {yearNum}
          </CardTitle>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Meta de ventas del mes (S/)" labelClassName="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
            <input
              type="number"
              min="0"
              value={formSalesGoal}
              onChange={(e) => setFormSalesGoal(e.target.value)}
              placeholder="Ej: 15000"
              className="w-full px-3 py-2.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm outline-none focus:border-primary transition-colors min-h-[44px]"
            />
          </Field>
          <Field label="Máximo de gastos del mes (S/)" labelClassName="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
            <input
              type="number"
              min="0"
              value={formExpensesGoal}
              onChange={(e) => setFormExpensesGoal(e.target.value)}
              placeholder="Ej: 8000"
              className="w-full px-3 py-2.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm outline-none focus:border-primary transition-colors min-h-[44px]"
            />
          </Field>
        </div>
        <button
          onClick={handleSaveConfig}
          className={cn(
            "mt-3 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all min-h-[44px]",
            savedFlash
              ? "bg-primary/10 text-white"
              : "bg-primary text-white hover:bg-primary/90"
          )}
        >
          <Save className="h-4 w-4" />
          {savedFlash ? "Guardado" : "Guardar metas"}
        </button>
      </div>

      {/* ── 2. Barras de progreso ventas y gastos ── */}
      {(budgetConfig.salesGoal > 0 || budgetConfig.expensesGoal > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {budgetConfig.salesGoal > 0 && (
            <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-4">
              <ProgressBar
                label="Ventas del mes"
                current={currentMonthSales}
                goal={budgetConfig.salesGoal}
                isSales={true}
              />
            </div>
          )}
          {budgetConfig.expensesGoal > 0 && (
            <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-4">
              <ProgressBar
                label="Gastos del mes"
                current={currentMonthExpenses}
                goal={budgetConfig.expensesGoal}
                isSales={false}
              />
            </div>
          )}
        </div>
      )}

      {/* ── 4. Proyección fin de mes ── */}
      {(currentMonthSales > 0 || currentMonthExpenses > 0) && (
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-4">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-3">
            Proyeccion al {totalDays} de {monthName}
          </CardTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[var(--surface-alt)] rounded-xl p-3">
              <p className="text-xs text-[var(--text-secondary)] font-semibold mb-1">Ventas proyectadas</p>
              <div className="flex items-center gap-2">
                {projection.sales >= (budgetConfig.salesGoal || projection.sales)
                  ? <TrendingUp className="h-4 w-4 text-[var(--data-success-500)] shrink-0" />
                  : <TrendingDown className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" />}
                <span className="text-lg font-extrabold text-[var(--text-primary)]">
                  {fmt(projection.sales)}
                </span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                Al ritmo actual ({fmt(currentMonthSales)} en {day} días)
              </p>
            </div>
            <div className="bg-[var(--surface-alt)] rounded-xl p-3">
              <p className="text-xs text-[var(--text-secondary)] font-semibold mb-1">Gastos proyectados</p>
              <div className="flex items-center gap-2">
                {projection.expenses > (budgetConfig.expensesGoal || projection.expenses)
                  ? <TrendingUp className="h-4 w-4 text-[var(--data-error-500)] shrink-0" />
                  : <TrendingDown className="h-4 w-4 text-[var(--data-success-500)] shrink-0" />}
                <span className="text-lg font-extrabold text-[var(--text-primary)]">
                  {fmt(projection.expenses)}
                </span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                Al ritmo actual ({fmt(currentMonthExpenses)} en {day} días)
              </p>
            </div>
            <div className="bg-[var(--surface-alt)] rounded-xl p-3">
              <p className="text-xs text-[var(--text-secondary)] font-semibold mb-1">Ganancia proyectada</p>
              <div className="flex items-center gap-2">
                {(projection.sales - projection.expenses) >= 0
                  ? <TrendingUp className="h-4 w-4 text-[var(--data-success-500)] shrink-0" />
                  : <TrendingDown className="h-4 w-4 text-[var(--data-error-500)] shrink-0" />}
                <span className={cn(
                  "text-lg font-extrabold",
                  (projection.sales - projection.expenses) >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"
                )}>
                  {fmt(projection.sales - projection.expenses)}
                </span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                Ventas menos gastos
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPIs de gastos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-4">
          <p className="text-xs text-[var(--text-secondary)] font-semibold">Total presupuestado</p>
          <p className="text-xl font-extrabold text-[var(--text-primary)] mt-1">
            {fmt(totals.budgeted)}
          </p>
        </div>
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-4">
          <p className="text-xs text-[var(--text-secondary)] font-semibold">Total ejecutado</p>
          <p className="text-xl font-extrabold text-[var(--text-primary)] mt-1">
            {fmt(totals.actual)}
          </p>
        </div>
        <div className={cn(
          "bg-[var(--surface-raised)] rounded-xl border p-4",
          totals.variance > 0 ? "border-[var(--data-error-500)]" : "border-[var(--data-success-500)]/30"
        )}>
          <p className="text-xs text-[var(--text-secondary)] font-semibold">Desviación gastos</p>
          <p className={cn("text-xl font-extrabold mt-1", totals.variance > 0 ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]")}>
            {totals.variance > 0 ? "+" : ""}{fmt(totals.variance)}
          </p>
          <p className={cn("text-xs font-bold", totals.pct > 0 ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]")}>
            {fmtPct(totals.pct)}
          </p>
        </div>
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-4">
          <p className="text-xs text-[var(--text-secondary)] font-semibold">Alertas</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[var(--data-error-500)] font-extrabold text-lg">{overBudgetCount}</span>
            <span className="text-xs text-[var(--text-tertiary)]">sobre</span>
            <span className="text-[var(--data-success-500)] font-extrabold text-lg">{underBudgetCount}</span>
            <span className="text-xs text-[var(--text-tertiary)]">bajo</span>
          </div>
        </div>
      </div>

      {/* ── 3. Gráfico de barras por categoría principal ── */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-4">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">
          Ventas · Gastos · Ganancia · Por departamento
        </CardTitle>
        {mainCategories.every((c) => c.actual === 0 && c.budgeted === 0) ? (
          <p className="text-sm text-[var(--text-tertiary)] text-center py-6">
            Sin datos para este mes. Registra ventas o gastos para ver el gráfico.
          </p>
        ) : (
          <CategoryChart categories={mainCategories} />
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm outline-none focus:border-primary transition-colors w-48 min-h-[44px]"
        />
      </div>

      {/* En el celular la tabla es tarjetas (`.admin-mobile-cards` esconde el
          <thead>): Depto/Mes/Estado se repiten acá, mismo estado, sólo
          visibles ahí. */}
      <div className="flex flex-col gap-3 sm:hidden">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-[var(--text-secondary)]">Depto</span>
          <FiltroColumna label="Depto" value={deptFilter} options={deptOptions} onChange={setDeptFilter} placeholder="Todos" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-[var(--text-secondary)]">Mes</span>
          <FiltroColumna
            label="Mes"
            value={effectiveMonthFilter === "all" ? undefined : effectiveMonthFilter}
            options={monthOptions}
            onChange={handleMonthFilterChange}
            placeholder="Todos"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-[var(--text-secondary)]">Estado</span>
          <FiltroColumna
            label="Estado"
            value={alertFilter}
            options={estadoOptions}
            etiqueta={(v) => ESTADOS.find((e) => e.value === v)?.label ?? v}
            onChange={setAlertFilter}
            placeholder="Todos"
          />
        </div>
      </div>

      {/* Tabla de detalle por categoría */}
      <DataTable filtrable className="min-w-[600px]">
        <thead>
          <tr className="border-b border-[var(--rule-base)]">
            <th>Categoría</th>
            <th>
              <span className="block">Depto</span>
              <FiltroColumna
                label="Depto"
                value={deptFilter}
                options={deptOptions}
                onChange={setDeptFilter}
                placeholder="Todos"
              />
            </th>
            <th>
              <span className="block">Mes</span>
              <FiltroColumna
                label="Mes"
                value={effectiveMonthFilter === "all" ? undefined : effectiveMonthFilter}
                options={monthOptions}
                onChange={handleMonthFilterChange}
                placeholder="Todos"
              />
            </th>
            <th className="text-right">Presupuesto</th>
            <th className="text-right">Real</th>
            <th className="text-right">Variación</th>
            <th className="text-center">Barra</th>
            <th className="text-center">
              <span className="block">Estado</span>
              <FiltroColumna
                label="Estado"
                value={alertFilter}
                options={estadoOptions}
                etiqueta={(v) => ESTADOS.find((e) => e.value === v)?.label ?? v}
                onChange={setAlertFilter}
                placeholder="Todos"
                className="mx-auto"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((b) => {
            const variance = b.budgeted > 0 ? ((b.actual - b.budgeted) / b.budgeted) * 100 : 0;
            const pctUsed = b.budgeted > 0 ? Math.min((b.actual / b.budgeted) * 100, 150) : 0;
            const status = Math.abs(variance) <= 10 ? "ok" : variance > 10 ? "over" : "under";
            return (
              <tr key={b.id}>
                <td className="font-semibold text-[var(--text-primary)]">{b.category}</td>
                <td className="text-[var(--text-secondary)]">{b.department}</td>
                <td className="text-xs text-[var(--text-tertiary)]">{b.month}</td>
                <td className="text-right font-mono text-[var(--text-primary)]">{fmt(b.budgeted)}</td>
                <td className="text-right font-mono font-bold text-[var(--text-primary)]">{fmt(b.actual)}</td>
                <td className={cn(
                  "text-right font-bold",
                  status === "over" ? "text-[var(--data-error-500)]" : status === "under" ? "text-[var(--data-success-500)]" : "text-[var(--text-secondary)]"
                )}>
                  {fmtPct(variance)}
                </td>
                <td>
                  <div className="w-full h-2.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        status === "over" ? "bg-[var(--data-error-500)]" : status === "under" ? "bg-primary/10" : "bg-primary/10"
                      )}
                      style={{ width: `${Math.min(pctUsed, 100)}%` }}
                    />
                  </div>
                </td>
                <td className="text-center">
                  {status === "ok" && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] text-xs font-bold">
                      <CheckCircle className="h-3 w-3" /> OK
                    </span>
                  )}
                  {status === "over" && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--data-error-100)] text-[var(--data-error-500)] text-xs font-bold">
                      <AlertTriangle className="h-3 w-3" /> Exceso
                    </span>
                  )}
                  {status === "under" && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] text-xs font-bold">
                      <TrendingDown className="h-3 w-3" /> Ahorro
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center text-[var(--text-tertiary)]">
                {expenses.length === 0
                  ? "No hay gastos registrados aún. Registra gastos en el módulo de Egresos."
                  : "No se encontraron líneas con los filtros seleccionados."}
              </td>
            </tr>
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
