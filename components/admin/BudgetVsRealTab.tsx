"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  TrendingDown, TrendingUp, AlertTriangle, CheckCircle,
  Download, Loader2, RefreshCw, Target, Save,
} from "lucide-react";
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
  let color = "bg-emerald-500";
  let textColor = "text-emerald-600";
  let bgLight = "bg-emerald-100";
  if (isSales) {
    if (pct >= 80) { color = "bg-emerald-500"; textColor = "text-emerald-600"; bgLight = "bg-emerald-100"; }
    else if (pct >= 50) { color = "bg-amber-400"; textColor = "text-amber-600"; bgLight = "bg-amber-100"; }
    else { color = "bg-red-500"; textColor = "text-red-600"; bgLight = "bg-red-100"; }
  } else {
    if (pct < 80) { color = "bg-emerald-500"; textColor = "text-emerald-600"; bgLight = "bg-emerald-100"; }
    else if (pct <= 100) { color = "bg-amber-400"; textColor = "text-amber-600"; bgLight = "bg-amber-100"; }
    else { color = "bg-red-500"; textColor = "text-red-600"; bgLight = "bg-red-100"; }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className={cn("text-sm font-bold", textColor)}>
          {pct.toFixed(0)}% {isSales ? "logrado" : "utilizado"}
        </span>
      </div>
      <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${display}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={cn("font-bold px-2 py-0.5 rounded-full", bgLight, textColor)}>
          Llevas {fmt(current)} de {fmt(goal)}
        </span>
        {goal > 0 && (
          <span className="text-gray-400">
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
              <span className="font-semibold text-gray-700 truncate max-w-[140px] sm:max-w-none">
                {c.label}
              </span>
              <span className={cn("font-bold", isOver ? "text-red-600" : isUnder ? "text-emerald-600" : "text-gray-500")}>
                {fmtPct(variance)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 w-14 shrink-0">Presup.</span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-300"
                  style={{ width: `${(c.budgeted / max) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-500 w-20 text-right shrink-0">{fmt(c.budgeted)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 w-14 shrink-0">Real</span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full", isOver ? "bg-red-500" : isUnder ? "bg-emerald-500" : "bg-primary")}
                  style={{ width: `${Math.min((c.actual / max) * 100, 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-gray-700 w-20 text-right shrink-0">
                {fmt(c.actual)}
              </span>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-emerald-300" /> Presupuestado</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-primary" /> Real (OK)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-red-500" /> Real (exceso)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-emerald-500" /> Real (ahorro)</span>
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
  const [deptFilter, setDeptFilter] = useState("all");
  const [alertFilter, setAlertFilter] = useState<"all" | "over" | "under" | "ok">("all");

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

  const effectiveMonthFilter = monthFilter === "all" && MONTHS.length > 1
    ? MONTHS[MONTHS.length - 1]
    : monthFilter;

  const filtered = useMemo(() => {
    return lines.filter((b) => {
      if (effectiveMonthFilter !== "all" && b.month !== effectiveMonthFilter) return false;
      if (deptFilter !== "all" && b.department !== deptFilter) return false;
      if (search && !b.category.toLowerCase().includes(search.toLowerCase())) return false;
      const variance = b.budgeted > 0 ? ((b.actual - b.budgeted) / b.budgeted) * 100 : 0;
      if (alertFilter === "over" && variance <= 10) return false;
      if (alertFilter === "under" && variance >= -10) return false;
      if (alertFilter === "ok" && Math.abs(variance) > 10) return false;
      return true;
    });
  }, [lines, search, effectiveMonthFilter, deptFilter, alertFilter]);

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
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-gray-500">Cargando datos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <p className="text-gray-500 text-sm">Error cargando datos</p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold"
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
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900">
            Meta vs Real
          </h2>
          <p className="text-sm text-gray-500 mt-1">
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
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* ── 1. Configurador de metas mensuales ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-gray-700">
            Mis metas de {monthName} {yearNum}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">
              Meta de ventas del mes (S/)
            </label>
            <input
              type="number"
              min="0"
              value={formSalesGoal}
              onChange={(e) => setFormSalesGoal(e.target.value)}
              placeholder="Ej: 15000"
              className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white text-gray-900 text-sm outline-none focus:border-primary transition-colors min-h-[44px]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">
              Máximo de gastos del mes (S/)
            </label>
            <input
              type="number"
              min="0"
              value={formExpensesGoal}
              onChange={(e) => setFormExpensesGoal(e.target.value)}
              placeholder="Ej: 8000"
              className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white text-gray-900 text-sm outline-none focus:border-primary transition-colors min-h-[44px]"
            />
          </div>
        </div>
        <button
          onClick={handleSaveConfig}
          className={cn(
            "mt-3 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all min-h-[44px]",
            savedFlash
              ? "bg-emerald-500 text-white"
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
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <ProgressBar
                label="Ventas del mes"
                current={currentMonthSales}
                goal={budgetConfig.salesGoal}
                isSales={true}
              />
            </div>
          )}
          {budgetConfig.expensesGoal > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
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
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">
            Proyeccion al {totalDays} de {monthName}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 font-semibold mb-1">Ventas proyectadas</p>
              <div className="flex items-center gap-2">
                {projection.sales >= (budgetConfig.salesGoal || projection.sales)
                  ? <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
                  : <TrendingDown className="h-4 w-4 text-amber-500 shrink-0" />}
                <span className="text-lg font-extrabold text-gray-900">
                  {fmt(projection.sales)}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Al ritmo actual ({fmt(currentMonthSales)} en {day} días)
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 font-semibold mb-1">Gastos proyectados</p>
              <div className="flex items-center gap-2">
                {projection.expenses > (budgetConfig.expensesGoal || projection.expenses)
                  ? <TrendingUp className="h-4 w-4 text-red-500 shrink-0" />
                  : <TrendingDown className="h-4 w-4 text-emerald-500 shrink-0" />}
                <span className="text-lg font-extrabold text-gray-900">
                  {fmt(projection.expenses)}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Al ritmo actual ({fmt(currentMonthExpenses)} en {day} días)
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 font-semibold mb-1">Ganancia proyectada</p>
              <div className="flex items-center gap-2">
                {(projection.sales - projection.expenses) >= 0
                  ? <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
                  : <TrendingDown className="h-4 w-4 text-red-500 shrink-0" />}
                <span className={cn(
                  "text-lg font-extrabold",
                  (projection.sales - projection.expenses) >= 0 ? "text-emerald-600" : "text-red-600"
                )}>
                  {fmt(projection.sales - projection.expenses)}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Ventas menos gastos
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPIs de gastos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold">Total presupuestado</p>
          <p className="text-xl font-extrabold text-gray-900 mt-1">
            {fmt(totals.budgeted)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold">Total ejecutado</p>
          <p className="text-xl font-extrabold text-gray-900 mt-1">
            {fmt(totals.actual)}
          </p>
        </div>
        <div className={cn(
          "bg-white rounded-xl border p-4",
          totals.variance > 0 ? "border-red-200" : "border-emerald-200"
        )}>
          <p className="text-xs text-gray-500 font-semibold">Desviación gastos</p>
          <p className={cn("text-xl font-extrabold mt-1", totals.variance > 0 ? "text-red-600" : "text-emerald-600")}>
            {totals.variance > 0 ? "+" : ""}{fmt(totals.variance)}
          </p>
          <p className={cn("text-xs font-bold", totals.pct > 0 ? "text-red-500" : "text-emerald-600")}>
            {fmtPct(totals.pct)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold">Alertas</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-red-600 font-extrabold text-lg">{overBudgetCount}</span>
            <span className="text-xs text-gray-400">sobre</span>
            <span className="text-emerald-600 font-extrabold text-lg">{underBudgetCount}</span>
            <span className="text-xs text-gray-400">bajo</span>
          </div>
        </div>
      </div>

      {/* ── 3. Gráfico de barras por categoría principal ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-bold text-gray-700 mb-4">
          Ventas · Gastos · Ganancia · Por departamento
        </h3>
        {mainCategories.every((c) => c.actual === 0 && c.budgeted === 0) ? (
          <p className="text-sm text-gray-400 text-center py-6">
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
          className="px-4 py-2 rounded-xl border-2 border-gray-200 bg-white text-gray-900 text-sm outline-none focus:border-primary transition-colors w-48 min-h-[44px]"
        />
        <select
          value={effectiveMonthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-gray-200 bg-white text-gray-900 text-sm outline-none focus:border-primary min-h-[44px]"
        >
          <option value="all">Todos los meses</option>
          {MONTHS.filter((m) => m !== "all").map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-gray-200 bg-white text-gray-900 text-sm outline-none focus:border-primary min-h-[44px]"
        >
          <option value="all">Todos los dptos</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
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
                "px-3 py-2 text-sm font-semibold transition-colors min-h-[44px]",
                alertFilter === val
                  ? "bg-primary text-white"
                  : "text-gray-600 hover:bg-gray-50"
              )}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de detalle por categoría */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Categoría</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Depto</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Mes</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">Presupuesto</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">Real</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">Variación</th>
                <th className="text-center px-4 py-3 text-gray-500 font-semibold">Barra</th>
                <th className="text-center px-4 py-3 text-gray-500 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const variance = b.budgeted > 0 ? ((b.actual - b.budgeted) / b.budgeted) * 100 : 0;
                const pctUsed = b.budgeted > 0 ? Math.min((b.actual / b.budgeted) * 100, 150) : 0;
                const status = Math.abs(variance) <= 10 ? "ok" : variance > 10 ? "over" : "under";
                return (
                  <tr
                    key={b.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-gray-900">{b.category}</td>
                    <td className="px-4 py-3 text-gray-500">{b.department}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{b.month}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{fmt(b.budgeted)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">{fmt(b.actual)}</td>
                    <td className={cn(
                      "px-4 py-3 text-right font-bold",
                      status === "over" ? "text-red-600" : status === "under" ? "text-emerald-600" : "text-gray-500"
                    )}>
                      {fmtPct(variance)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            status === "over" ? "bg-red-500" : status === "under" ? "bg-emerald-500" : "bg-emerald-500"
                          )}
                          style={{ width: `${Math.min(pctUsed, 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {status === "ok" && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                          <CheckCircle className="h-3 w-3" /> OK
                        </span>
                      )}
                      {status === "over" && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                          <AlertTriangle className="h-3 w-3" /> Exceso
                        </span>
                      )}
                      {status === "under" && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                          <TrendingDown className="h-3 w-3" /> Ahorro
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
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
