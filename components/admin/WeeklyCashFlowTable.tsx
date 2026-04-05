"use client";
import { useState, useEffect, useMemo } from "react";
import { BarChart2, TrendingUp, TrendingDown, Minus, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Helpers ── */
const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

const DAY_LABELS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

/* ── Types ── */
type SaleRecord = {
  id: string;
  total: number;
  createdAt: string;
};

type ExpenseSummary = {
  date: string;
  purchases: number;
  expenses: number;
  receipts: number; // cobros del dia
};

type WeekRow = {
  label: string;
  key: "sales" | "receipts" | "purchases" | "expenses" | "net";
  values: number[];
};

/* ── Helpers de fecha ── */
function getWeekDates(offset = 0): string[] {
  const now = new Date();
  const day = now.getDay(); // 0=dom
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

export default function WeeklyCashFlowTable() {
  const [salesData, setSalesData] = useState<SaleRecord[]>([]);
  const [expensesData, setExpensesData] = useState<ExpenseSummary[]>([]);
  const [prevSalesData, setPrevSalesData] = useState<SaleRecord[]>([]);
  const [prevExpensesData, setPrevExpensesData] = useState<ExpenseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const currentWeek = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const prevWeek = useMemo(() => getWeekDates(weekOffset - 1), [weekOffset]);

  const load = () => {
    setLoading(true);
    setError(null);

    const buildQuery = (dates: string[]) =>
      `from=${dates[0]}&to=${dates[6]}`;

    Promise.all([
      fetch(`/api/sales?${buildQuery(currentWeek)}&limit=500`).then((r) => r.json()),
      fetch(`/api/expenses/summary?${buildQuery(currentWeek)}`).then((r) => r.json()),
      fetch(`/api/sales?${buildQuery(prevWeek)}&limit=500`).then((r) => r.json()),
      fetch(`/api/expenses/summary?${buildQuery(prevWeek)}`).then((r) => r.json()),
    ])
      .then(([sC, eC, sP, eP]) => {
        setSalesData(Array.isArray(sC) ? sC : sC?.sales ?? []);
        setExpensesData(Array.isArray(eC) ? eC : eC?.data ?? []);
        setPrevSalesData(Array.isArray(sP) ? sP : sP?.sales ?? []);
        setPrevExpensesData(Array.isArray(eP) ? eP : eP?.data ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  /* ── Construir filas ── */
  const { rows, totals, prevTotals } = useMemo(() => {
    const salesByDay = currentWeek.map((date) =>
      salesData
        .filter((s) => s.createdAt.startsWith(date))
        .reduce((sum, s) => sum + s.total, 0)
    );

    const expByDay = currentWeek.map((date) => {
      const rec = expensesData.find((e) => e.date === date);
      return {
        receipts: rec?.receipts ?? 0,
        purchases: rec?.purchases ?? 0,
        expenses: rec?.expenses ?? 0,
      };
    });

    const receiptsDay = expByDay.map((d) => d.receipts);
    const purchasesDay = expByDay.map((d) => d.purchases);
    const expensesDay = expByDay.map((d) => d.expenses);
    const netDay = salesByDay.map(
      (s, i) => s + receiptsDay[i] - purchasesDay[i] - expensesDay[i]
    );

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

    // semana anterior
    const prevSalesByDay = prevWeek.map((date) =>
      prevSalesData
        .filter((s) => s.createdAt.startsWith(date))
        .reduce((acc, s) => acc + s.total, 0)
    );
    const prevExpByDay = prevWeek.map((date) => {
      const rec = prevExpensesData.find((e) => e.date === date);
      return {
        receipts: rec?.receipts ?? 0,
        purchases: rec?.purchases ?? 0,
        expenses: rec?.expenses ?? 0,
      };
    });
    const prevNet = prevSalesByDay.map(
      (s, i) =>
        s + prevExpByDay[i].receipts - prevExpByDay[i].purchases - prevExpByDay[i].expenses
    );

    const rows: WeekRow[] = [
      { label: "Ventas", key: "sales", values: salesByDay },
      { label: "Cobros", key: "receipts", values: receiptsDay },
      { label: "Compras", key: "purchases", values: purchasesDay.map((v) => -v) },
      { label: "Gastos", key: "expenses", values: expensesDay.map((v) => -v) },
      { label: "Neto", key: "net", values: netDay },
    ];

    return {
      rows,
      totals: {
        sales: sum(salesByDay),
        receipts: sum(receiptsDay),
        purchases: sum(purchasesDay),
        expenses: sum(expensesDay),
        net: sum(netDay),
      },
      prevTotals: {
        net: sum(prevNet),
      },
    };
  }, [salesData, expensesData, prevSalesData, prevExpensesData, currentWeek, prevWeek]);

  const getTrend = (current: number, prev: number) => {
    if (prev === 0) return null;
    const pct = ((current - prev) / Math.abs(prev)) * 100;
    return pct;
  };

  const netTrend = getTrend(totals.net, prevTotals.net);

  /* ── Render ── */
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-[#00B4A6]" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Flujo de Caja Semanal
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
          >
            Anterior
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-32 text-center">
            {weekOffset === 0
              ? "Esta semana"
              : weekOffset === -1
              ? "Semana pasada"
              : `Semana ${Math.abs(weekOffset)} atras`}
          </span>
          <button
            onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
            disabled={weekOffset === 0}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Siguiente
          </button>
          <button
            onClick={load}
            disabled={loading}
            title="Refrescar"
            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Neto total con tendencia */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">Ventas semana</p>
          <p className="text-xl font-bold text-[#00B4A6] dark:text-[#2dd4bf]">
            {fmt(totals.sales)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total compras</p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">
            {fmt(totals.purchases)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total gastos</p>
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
            {fmt(totals.expenses)}
          </p>
        </div>
        <div
          className={cn(
            "rounded-xl border p-3",
            totals.net >= 0
              ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10"
              : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10"
          )}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">Neto semanal</p>
            {netTrend !== null && (
              <span
                className={cn(
                  "text-xs font-medium flex items-center gap-0.5",
                  netTrend > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : netTrend < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-gray-500"
                )}
              >
                {netTrend > 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : netTrend < 0 ? (
                  <TrendingDown className="w-3 h-3" />
                ) : (
                  <Minus className="w-3 h-3" />
                )}
                {Math.abs(netTrend).toFixed(0)}%
              </span>
            )}
          </div>
          <p
            className={cn(
              "text-xl font-bold",
              totals.net >= 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-red-700 dark:text-red-400"
            )}
          >
            {fmt(totals.net)}
          </p>
        </div>
      </div>

      {/* Error / Loading */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error} — mostrando datos estimados
        </div>
      )}
      {loading && (
        <div className="flex items-center justify-center py-8 text-gray-400 dark:text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Cargando flujo de caja...
        </div>
      )}

      {/* Tabla */}
      {!loading && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 w-28">
                  Concepto
                </th>
                {DAY_LABELS.map((d, i) => (
                  <th
                    key={d}
                    className={cn(
                      "px-3 py-3 text-right font-medium text-gray-500 dark:text-gray-400",
                      currentWeek[i] === new Date().toISOString().split("T")[0] &&
                        "text-[#00B4A6] dark:text-[#2dd4bf]"
                    )}
                  >
                    <div>{d}</div>
                    <div className="text-xs font-normal text-gray-400 dark:text-gray-500">
                      {currentWeek[i]?.slice(5)}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {rows.map((row) => {
                const rowTotal =
                  row.key === "purchases"
                    ? -totals.purchases
                    : row.key === "expenses"
                    ? -totals.expenses
                    : totals[row.key];
                const isNet = row.key === "net";

                return (
                  <tr
                    key={row.key}
                    className={cn(
                      isNet
                        ? "bg-gray-50 dark:bg-gray-750 font-semibold"
                        : "hover:bg-gray-50/50 dark:hover:bg-gray-750/50"
                    )}
                  >
                    <td
                      className={cn(
                        "px-4 py-2.5",
                        isNet
                          ? "font-semibold text-gray-800 dark:text-gray-200"
                          : "text-gray-600 dark:text-gray-400"
                      )}
                    >
                      {row.label}
                    </td>
                    {row.values.map((val, i) => (
                      <td
                        key={i}
                        className={cn(
                          "px-3 py-2.5 text-right text-xs tabular-nums",
                          val > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : val < 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-gray-400 dark:text-gray-600"
                        )}
                      >
                        {val !== 0
                          ? `S/ ${Math.abs(val).toLocaleString("es-PE", { minimumFractionDigits: 0 })}`
                          : "—"}
                      </td>
                    ))}
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right text-xs tabular-nums font-semibold",
                        rowTotal > 0
                          ? "text-emerald-700 dark:text-emerald-400"
                          : rowTotal < 0
                          ? "text-red-700 dark:text-red-400"
                          : "text-gray-400"
                      )}
                    >
                      {rowTotal !== 0
                        ? `S/ ${Math.abs(rowTotal).toLocaleString("es-PE", { minimumFractionDigits: 0 })}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tendencia vs semana anterior */}
      {!loading && netTrend !== null && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          {netTrend > 0 ? "Mejor" : "Peor"} que la semana anterior en un{" "}
          <span
            className={cn(
              "font-semibold",
              netTrend > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            )}
          >
            {Math.abs(netTrend).toFixed(1)}%
          </span>
        </p>
      )}
    </div>
  );
}
