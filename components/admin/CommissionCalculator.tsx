"use client";
 
import { useState, useEffect, useMemo, useCallback } from "react";
import { Field } from "@/components/admin/shared/Field";
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
      "Ventas totales": Number(s.totalSales).toFixed(2),
      "% Comision": s.rate,
      "Comision S/": Number(s.commission).toFixed(2),
      "Nro ventas": s.saleCount,
    }));
    exportToCSV(rows, `comisiones-${new Date().toISOString().split("T")[0]}.csv`);
  };

  /* ── Render ── */
  return (
    <div className="space-y-4">

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
                : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:bg-[var(--surface-alt)] dark:hover:bg-gray-750"
            )}
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] hover:bg-[var(--surface-alt)] dark:hover:bg-gray-750 transition-colors"
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
          <Field className="flex items-center gap-3" label="Porcentaje por defecto" labelClassName="text-sm text-[var(--text-secondary)] w-40">
            {(id) => (
              <div className="flex items-center gap-1.5">
                <input
                  id={id}
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
            )}
          </Field>

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
        <div className="flex items-center gap-2 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] px-4 py-3 text-sm">
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
          <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-primary" />
              <p className="text-sm text-[var(--text-tertiary)]">Cajeros activos</p>
            </div>
            <p className="text-3xl font-extrabold text-[var(--text-primary)] tabular-nums">
              {summaries.length}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
            <p className="text-sm text-[var(--text-tertiary)] mb-2">Ventas totales</p>
            <p className="text-3xl font-extrabold text-primary tabular-nums">
              {fmt(summaries.reduce((s, c) => s + c.totalSales, 0))}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/5 p-5">
            <p className="text-sm text-[var(--text-tertiary)] mb-2">
              Total a pagar en comisiones
            </p>
            <p className="text-3xl font-extrabold text-[var(--data-warning-500)] tabular-nums">{fmt(totalCommissions)}</p>
          </div>
        </div>
      )}

      {/* Tabla de cajeros */}
      {!loading && !error && summaries.length > 0 && (
        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-x-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)]">
            <p className="text-base font-bold text-[var(--text-primary)]">
              Detalle por cajero
            </p>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule-soft)] bg-[var(--surface-alt)]/50">
                <th className="px-4 py-3.5 text-sm uppercase tracking-wide text-left font-semibold text-[var(--text-tertiary)]">
                  Cajero
                </th>
                <th className="px-4 py-3.5 text-sm uppercase tracking-wide text-right font-semibold text-[var(--text-tertiary)]">
                  Ventas totales
                </th>
                <th className="px-4 py-3.5 text-sm uppercase tracking-wide text-right font-semibold text-[var(--text-tertiary)]">
                  Nro ventas
                </th>
                <th className="px-4 py-3.5 text-sm uppercase tracking-wide text-right font-semibold text-[var(--text-tertiary)]">
                  % Comisión
                </th>
                <th className="px-4 py-3.5 text-sm uppercase tracking-wide text-right font-semibold text-[var(--text-tertiary)]">
                  Comisión
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {summaries.map((s) => (
                <tr
                  key={s.cashierId}
                  className="hover:bg-[var(--surface-alt)] dark:hover:bg-gray-750 transition-colors"
                >
                  <td className="px-4 py-4 text-base font-semibold text-[var(--text-primary)]">
                    {s.cashierName}
                  </td>
                  <td className="px-4 py-4 text-right text-base text-[var(--text-primary)] tabular-nums">
                    {fmt(s.totalSales)}
                  </td>
                  <td className="px-4 py-4 text-right text-base text-[var(--text-secondary)] tabular-nums">
                    {s.saleCount}
                  </td>
                  <td className="px-4 py-4 text-right text-base text-[var(--text-secondary)] tabular-nums">
                    {s.rate}%
                  </td>
                  <td className="px-4 py-4 text-right text-base font-bold text-[var(--data-warning-500)] tabular-nums">
                    {fmt(s.commission)}
                  </td>
                </tr>
              ))}
              <tr className="bg-[var(--surface-alt)] dark:bg-gray-750 font-bold">
                <td className="px-4 py-4 text-base text-[var(--text-primary)]">Total</td>
                <td className="px-4 py-4 text-right text-base text-[var(--text-primary)] tabular-nums">
                  {fmt(summaries.reduce((s, c) => s + c.totalSales, 0))}
                </td>
                <td className="px-4 py-4 text-right text-base text-[var(--text-secondary)] tabular-nums">
                  {summaries.reduce((s, c) => s + c.saleCount, 0)}
                </td>
                <td className="px-4 py-4" />
                <td className="px-4 py-4 text-right text-lg font-extrabold text-[var(--data-warning-500)] tabular-nums">
                  {fmt(totalCommissions)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && summaries.length === 0 && (
        <div className="py-12 px-4 text-center bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl">
          <div className="h-12 w-12 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center mx-auto mb-3">
            <Users className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
          </div>
          <p className="text-base font-semibold text-[var(--text-primary)] mb-1">Sin ventas en el periodo</p>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">Las comisiones se calculan a partir de las ventas registradas. Genera tu primera venta desde POS para ver el desglose.</p>
        </div>
      )}
    </div>
  );
}
