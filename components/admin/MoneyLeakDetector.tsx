"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo } from "react";
import { AlertTriangle, TrendingUp, Search, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Helpers ── */
const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

/* ── Types ── */
type ExpenseRecord = {
  id: string;
  category: string;
  amount: number;
  date: string;
  description?: string;
};

type CategorySummary = {
  category: string;
  thisMonth: number;
  prevAvg: number;
  diff: number;
  pctChange: number;
  isLeak: boolean;
};

/* ── Helpers de fecha ── */
function getMonthRange(monthOffset: number): { from: string; to: string } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const from = d.toISOString().split("T")[0];
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from, to: last.toISOString().split("T")[0] };
}

export default function MoneyLeakDetector() {
  const [currentExp, setCurrentExp] = useState<ExpenseRecord[]>([]);
  const [prevExp, setPrevExp] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const LEAK_THRESHOLD = 30; // %

  const load = () => {
    setLoading(true);
    setError(null);
    const curr = getMonthRange(0);
    const prev3 = [getMonthRange(-1), getMonthRange(-2), getMonthRange(-3)];

    const queries = [
      fetch(`/api/expenses?limit=200&from=${curr.from}&to=${curr.to}`).then((r) => r.ok ? r.json() : []),
      ...prev3.map((r) =>
        fetch(`/api/expenses?limit=200&from=${r.from}&to=${r.to}`).then((r) => r.ok ? r.json() : [])
      ),
    ];

    Promise.all(queries)
      .then(([current, m1, m2, m3]) => {
        const parse = (d: unknown) =>
          Array.isArray(d) ? d : (d as { expenses?: ExpenseRecord[] })?.expenses ?? [];
        setCurrentExp(parse(current));
        setPrevExp([...parse(m1), ...parse(m2), ...parse(m3)]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  /* ── Calculos ── */
  const { categories, totalLeaks, leakCount } = useMemo(() => {
    const sumByCategory = (records: ExpenseRecord[]) => {
      const acc: Record<string, number> = {};
      for (const r of records) {
        acc[r.category] = (acc[r.category] ?? 0) + r.amount;
      }
      return acc;
    };

    const currBycat = sumByCategory(currentExp);
    const prevBycat: Record<string, number[]> = {};

    // Agrupa 3 meses anteriores separados
    for (const r of prevExp) {
      if (!prevBycat[r.category]) prevBycat[r.category] = [0, 0, 0];
    }
    // Simple promedio usando total dividido entre 3
    const prev3Total = sumByCategory(prevExp);

    const allCats = new Set([...Object.keys(currBycat), ...Object.keys(prev3Total)]);

    const cats: CategorySummary[] = Array.from(allCats).map((cat) => {
      const thisMonth = currBycat[cat] ?? 0;
      const prevAvg = (prev3Total[cat] ?? 0) / 3;
      const diff = thisMonth - prevAvg;
      const pctChange = prevAvg > 0 ? (diff / prevAvg) * 100 : thisMonth > 0 ? 100 : 0;
      return {
        category: cat,
        thisMonth,
        prevAvg,
        diff,
        pctChange,
        isLeak: pctChange > LEAK_THRESHOLD && diff > 0,
      };
    });

    cats.sort((a, b) => b.pctChange - a.pctChange);

    const leaks = cats.filter((c) => c.isLeak);
    const totalLeaks = leaks.reduce((s, c) => s + c.diff, 0);

    return { categories: cats, totalLeaks, leakCount: leaks.length };
  }, [currentExp, prevExp]);

  /* ── Render ── */
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-[#00B4A6]" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Detector de Fugas de Dinero
          </h2>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-[#00B4A6] dark:hover:text-[#2dd4bf] transition-colors"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {/* Resumen de alertas */}
      {!loading && leakCount > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800 dark:text-red-300 text-sm">
              {leakCount} {leakCount === 1 ? "categoria con fuga detectada" : "categorias con fuga detectadas"}
            </p>
            <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">
              Gasto extra este mes:{" "}
              <span className="font-bold">{fmt(totalLeaks)}</span> por encima del promedio.
            </p>
          </div>
        </div>
      )}

      {!loading && leakCount === 0 && !error && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
          <Search className="w-4 h-4" />
          Sin fugas detectadas — los gastos estan dentro del rango normal.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-10 text-gray-400 dark:text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Analizando gastos de los ultimos 3 meses...
        </div>
      )}

      {/* Lista por categoria */}
      {!loading && !error && (
        <div className="space-y-3">
          {categories.map((cat) => {
            const barCurrent = Math.min(100, cat.thisMonth > 0 ? 100 : 0);
            const barAvg =
              cat.prevAvg > 0 && cat.thisMonth > 0
                ? Math.min(100, (cat.prevAvg / cat.thisMonth) * 100)
                : cat.prevAvg > 0
                ? 100
                : 0;

            return (
              <div
                key={cat.category}
                className={cn(
                  "rounded-xl border p-4",
                  cat.isLeak
                    ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/5"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {cat.category}
                      </span>
                      {cat.isLeak && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                          <TrendingUp className="w-3 h-3" />
                          +{cat.pctChange.toFixed(0)}%
                        </span>
                      )}
                      {!cat.isLeak && cat.pctChange > 0 && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          +{cat.pctChange.toFixed(0)}%
                        </span>
                      )}
                      {cat.pctChange <= 0 && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400">
                          {cat.pctChange.toFixed(0)}%
                        </span>
                      )}
                    </div>
                    {cat.isLeak && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                        {cat.category}: {fmt(cat.thisMonth)} (+{fmt(cat.diff)} vs promedio). Investiga.
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {fmt(cat.thisMonth)}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Prom: {fmt(cat.prevAvg)}
                    </p>
                  </div>
                </div>

                {/* Barras comparativas */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-16 shrink-0">
                      Este mes
                    </span>
                    <div className="flex-1 h-3 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          cat.isLeak ? "bg-red-500 dark:bg-red-600" : "bg-[#00B4A6] dark:bg-[#2dd4bf]"
                        )}
                        style={{ width: `${barCurrent}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-16 shrink-0">
                      Promedio
                    </span>
                    <div className="flex-1 h-3 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gray-400 dark:bg-gray-500 transition-all duration-500"
                        style={{ width: `${barAvg}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
