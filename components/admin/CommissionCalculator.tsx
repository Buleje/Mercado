"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo, useCallback } from "react";
import { DollarSign, Download, Loader2, AlertTriangle, Settings, RefreshCw, Users } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

/* ── Helpers ── */
const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

const STORAGE_KEY = "commission_rates";

/* ── Types ── */
type SaleRecord = {
  id: string;
  total: number;
  cashierId: string;
  cashierName: string;
  createdAt: string;
};

type CashierSummary = {
  cashierId: string;
  cashierName: string;
  totalSales: number;
  saleCount: number;
  commission: number;
  rate: number;
};

/* ── Component ── */
export default function CommissionCalculator() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [defaultRate, setDefaultRate] = useState(2);
  const [customRates, setCustomRates] = useState<Record<string, number>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [period, setPeriod] = useState<"month" | "week">("month");

  /* Cargar tasas desde localStorage */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setDefaultRate(parsed.defaultRate ?? 2);
        setCustomRates(parsed.customRates ?? {});
      }
    } catch {
      /* silencio */
    }
  }, []);

  /* Guardar tasas */
  const saveRates = useCallback(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ defaultRate, customRates })
    );
  }, [defaultRate, customRates]);

  useEffect(() => {
    saveRates();
  }, [defaultRate, customRates, saveRates]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const now = new Date();
    let from: string;
    if (period === "month") {
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    } else {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((day + 6) % 7));
      from = monday.toISOString().split("T")[0];
    }
    const to = now.toISOString().split("T")[0];

    fetch(`/api/sales?from=${from}&to=${to}&limit=500`)
      .then((r) => r.json())
      .then((data) => {
        const rows: SaleRecord[] = Array.isArray(data)
          ? data
          : data?.sales ?? [];
        setSales(rows);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  /* ── Calculos ── */
  const { summaries, totalCommissions } = useMemo(() => {
    const byId: Record<string, { name: string; total: number; count: number }> = {};

    for (const s of sales) {
      const id = s.cashierId || "unknown";
      const name = s.cashierName || "Sin cajero";
      if (!byId[id]) byId[id] = { name, total: 0, count: 0 };
      byId[id].total += s.total;
      byId[id].count++;
    }

    const summaries: CashierSummary[] = Object.entries(byId).map(
      ([id, { name, total, count }]) => {
        const rate = customRates[id] ?? defaultRate;
        return {
          cashierId: id,
          cashierName: name,
          totalSales: total,
          saleCount: count,
          commission: (total * rate) / 100,
          rate,
        };
      }
    );

    summaries.sort((a, b) => b.totalSales - a.totalSales);
    const totalCommissions = summaries.reduce((s, c) => s + c.commission, 0);

    return { summaries, totalCommissions };
  }, [sales, defaultRate, customRates]);

  /* ── Export CSV ── */
  const handleExport = () => {
    const rows = summaries.map((s) => ({
      Cajero: s.cashierName,
      "Ventas totales": s.totalSales.toFixed(2),
      "% Comision": s.rate,
      "Comision S/": s.commission.toFixed(2),
      "Nro ventas": s.saleCount,
    }));
    exportToCSV(rows, `comisiones-${new Date().toISOString().split("T")[0]}.csv`);
  };

  /* ── Render ── */
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-[#0f766e]" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Calculadora de Comisiones
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as "month" | "week")}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300"
          >
            <option value="month">Este mes</option>
            <option value="week">Esta semana</option>
          </select>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className={cn(
              "p-1.5 rounded-lg border transition-colors",
              showSettings
                ? "border-[#0f766e] bg-[#0f766e]/10 text-[#0f766e]"
                : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750"
            )}
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Panel de configuracion */}
      {showSettings && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Configuracion de comisiones
          </p>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 dark:text-gray-400 w-40">
              Porcentaje por defecto
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={defaultRate}
                onChange={(e) => setDefaultRate(Number(e.target.value))}
                className="w-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-center text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
          </div>

          {summaries.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Tasa individual por cajero
              </p>
              {summaries.map((s) => (
                <div key={s.cashierId} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 dark:text-gray-300 w-40 truncate">
                    {s.cashierName}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={customRates[s.cashierId] ?? defaultRate}
                      onChange={(e) =>
                        setCustomRates((prev) => ({
                          ...prev,
                          [s.cashierId]: Number(e.target.value),
                        }))
                      }
                      className="w-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-center text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
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
          Calculando comisiones...
        </div>
      )}

      {/* Resumen total */}
      {!loading && !error && summaries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-[#0f766e]" />
              <p className="text-xs text-gray-500 dark:text-gray-400">Cajeros activos</p>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {summaries.length}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Ventas totales</p>
            <p className="text-2xl font-bold text-[#0f766e] dark:text-[#14b8a6]">
              {fmt(summaries.reduce((s, c) => s + c.totalSales, 0))}
            </p>
          </div>
          <div className="rounded-xl border border-[#f97316] dark:border-[#f97316]/40 bg-[#f97316]/5 dark:bg-[#f97316]/5 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              Total a pagar en comisiones
            </p>
            <p className="text-2xl font-bold text-[#f97316]">{fmt(totalCommissions)}</p>
          </div>
        </div>
      )}

      {/* Tabla de cajeros */}
      {!loading && !error && summaries.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-x-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Detalle por cajero
            </p>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 text-xs text-[#0f766e] dark:text-[#14b8a6] hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 dark:text-gray-400">
                  Cajero
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">
                  Ventas totales
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">
                  Nro ventas
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">
                  % Comision
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">
                  Comision
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {summaries.map((s) => (
                <tr
                  key={s.cashierId}
                  className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">
                    {s.cashierName}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-900 dark:text-gray-100">
                    {fmt(s.totalSales)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500 dark:text-gray-400">
                    {s.saleCount}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500 dark:text-gray-400">
                    {s.rate}%
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-[#f97316]">
                    {fmt(s.commission)}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 dark:bg-gray-750 font-semibold">
                <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">Total</td>
                <td className="px-4 py-2.5 text-right text-gray-800 dark:text-gray-200">
                  {fmt(summaries.reduce((s, c) => s + c.totalSales, 0))}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">
                  {summaries.reduce((s, c) => s + c.saleCount, 0)}
                </td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right text-[#f97316] text-base">
                  {fmt(totalCommissions)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && summaries.length === 0 && (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
          No hay ventas registradas para el periodo seleccionado.
        </div>
      )}
    </div>
  );
}
