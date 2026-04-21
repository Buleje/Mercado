"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo, useCallback } from "react";
import { DollarSign, Download, Loader2, AlertTriangle, Settings, RefreshCw, Users } from "@buleje/design-system/icons";
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
    <div className="space-y-6">
      {/* Toolbar (sin titulo redundante — el nav ya indica el modulo) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as "month" | "week")}
            className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
          >
            <option value="month">Este mes</option>
            <option value="week">Esta semana</option>
          </select>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className={cn(
              "p-1.5 rounded-lg border transition-colors",
              showSettings
                ? "border-primary bg-primary/10 text-primary"
                : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:bg-gray-50 dark:hover:bg-gray-750"
            )}
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Panel de configuracion */}
      {showSettings && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 space-y-3">
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            Configuracion de comisiones
          </p>
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--text-secondary)] w-40">
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
                className="w-20 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1 text-sm text-center text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-sm text-[var(--text-secondary)]">%</span>
            </div>
          </div>

          {summaries.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-tertiary)]">
                Tasa individual por cajero
              </p>
              {summaries.map((s) => (
                <div key={s.cashierId} className="flex items-center gap-3">
                  <span className="text-sm text-[var(--text-secondary)] w-40 truncate">
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
                      className="w-20 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1 text-sm text-center text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <span className="text-sm text-[var(--text-secondary)]">%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/20 text-[var(--data-error)] dark:text-[var(--data-error)] px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-10 text-[var(--text-tertiary)]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Calculando comisiones...
        </div>
      )}

      {/* Resumen total */}
      {!loading && !error && summaries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-primary" />
              <p className="text-xs text-[var(--text-tertiary)]">Cajeros activos</p>
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">
              {summaries.length}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
            <p className="text-xs text-[var(--text-tertiary)] mb-1">Ventas totales</p>
            <p className="text-2xl font-bold text-primary dark:text-primary">
              {fmt(summaries.reduce((s, c) => s + c.totalSales, 0))}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--data-warning)] dark:border-[var(--data-warning)]/40 bg-[var(--data-warning)]/5 dark:bg-[var(--data-warning)]/5 p-4">
            <p className="text-xs text-[var(--text-tertiary)] mb-1">
              Total a pagar en comisiones
            </p>
            <p className="text-2xl font-bold text-[var(--data-warning)]">{fmt(totalCommissions)}</p>
          </div>
        </div>
      )}

      {/* Tabla de cajeros */}
      {!loading && !error && summaries.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-x-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule-base)]">
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              Detalle por cajero
            </p>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 text-xs text-primary dark:text-primary hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule-base)]">
                <th className="px-4 py-2.5 text-left font-medium text-[var(--text-tertiary)]">
                  Cajero
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-[var(--text-tertiary)]">
                  Ventas totales
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-[var(--text-tertiary)]">
                  Nro ventas
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-[var(--text-tertiary)]">
                  % Comision
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-[var(--text-tertiary)]">
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
                  <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">
                    {s.cashierName}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--text-primary)]">
                    {fmt(s.totalSales)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--text-tertiary)]">
                    {s.saleCount}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--text-tertiary)]">
                    {s.rate}%
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-[var(--data-warning)]">
                    {fmt(s.commission)}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 dark:bg-gray-750 font-semibold">
                <td className="px-4 py-2.5 text-[var(--text-primary)]">Total</td>
                <td className="px-4 py-2.5 text-right text-[var(--text-primary)]">
                  {fmt(summaries.reduce((s, c) => s + c.totalSales, 0))}
                </td>
                <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">
                  {summaries.reduce((s, c) => s + c.saleCount, 0)}
                </td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right text-[var(--data-warning)] text-base">
                  {fmt(totalCommissions)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && summaries.length === 0 && (
        <div className="text-center py-12 text-[var(--text-tertiary)] text-sm">
          No hay ventas registradas para el periodo seleccionado.
        </div>
      )}
    </div>
  );
}
