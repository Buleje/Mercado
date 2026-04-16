"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  RefreshCw,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types (espejo del contract en lib/finance/cashflow-rolling.ts) ─────────

type WeekRow = {
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  openingBalance: number;
  expectedCollections: number;
  creditCollections: number;
  supplierPayments: number;
  payroll: number;
  loans: number;
  otherExpenses: number;
  closingBalance: number;
  isNegative: boolean;
};

type CashflowData = {
  tenantId: string;
  generatedAt: string;
  startingBalance: number;
  weeks: WeekRow[];
  criticalWeek: number | null;
};

// ── Formatters (module-level per react-best-practices rendering-hoist) ─────

const currencyFormatter = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const shortDateFormatter = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
});

function formatCurrency(n: number): string {
  return currencyFormatter.format(n);
}

function formatShortDate(iso: string): string {
  try {
    return shortDateFormatter.format(new Date(iso));
  } catch {
    return iso;
  }
}

// ── Row definitions para pintar la tabla concepto × 13 semanas ─────────────

type RowKey =
  | "openingBalance"
  | "expectedCollections"
  | "creditCollections"
  | "supplierPayments"
  | "payroll"
  | "loans"
  | "otherExpenses"
  | "closingBalance";

type RowConfig = {
  key: RowKey;
  label: string;
  sign: "+" | "-" | "=";
  /** tone for the number cell text */
  tone: "neutral" | "positive" | "negative" | "bold";
};

const ROWS: RowConfig[] = [
  { key: "openingBalance", label: "Saldo inicial", sign: "=", tone: "neutral" },
  { key: "expectedCollections", label: "Cobros esperados", sign: "+", tone: "positive" },
  { key: "creditCollections", label: "Cobros fiados", sign: "+", tone: "positive" },
  { key: "supplierPayments", label: "Pagos proveedores", sign: "-", tone: "negative" },
  { key: "payroll", label: "Nómina", sign: "-", tone: "negative" },
  { key: "loans", label: "Préstamos", sign: "-", tone: "negative" },
  { key: "otherExpenses", label: "Otros gastos fijos", sign: "-", tone: "negative" },
  { key: "closingBalance", label: "Saldo final", sign: "=", tone: "bold" },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function CashflowRollingTable() {
  const [data, setData] = useState<CashflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/cashflow-rolling", {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }
      const json = (await res.json()) as CashflowData;
      setData(json);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cargar el flujo de caja",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const criticalWeek = data?.criticalWeek ?? null;

  const weekHeaders = useMemo(() => {
    if (!data) return [];
    return data.weeks.map((w) => ({
      number: w.weekNumber,
      start: w.weekStart,
      isNegative: w.isNegative,
    }));
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center  shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Flujo de caja — 13 semanas
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Proyección rodante. Actualizado al{" "}
              {data ? formatShortDate(data.generatedAt) : "..."}.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchData()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50  transition-colors shrink-0 min-h-[44px]"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {/* Critical week alert */}
      {criticalWeek !== null && data && (
        <div className="flex items-start gap-3 p-4 rounded-xl border-2 border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-red-800 dark:text-red-200">
              Alerta: en la semana {criticalWeek} tu caja podría caer en
              negativo.
            </p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-1">
              Acción sugerida: cobrar fiados vencidos, renegociar pagos a
              proveedores, o retrasar gastos no esenciales. Saldo proyectado al
              cierre de la semana {criticalWeek}:{" "}
              <strong>
                {formatCurrency(
                  data.weeks[criticalWeek - 1]?.closingBalance ?? 0,
                )}
              </strong>
              .
            </p>
          </div>
        </div>
      )}

      {/* Starting balance card */}
      {data && (
        <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-card">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
              Saldo hoy
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 font-mono">
              {formatCurrency(data.startingBalance)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
              Semanas sanas
            </p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {data.weeks.filter((w) => !w.isNegative).length} / 13
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      )}

      {/* Error */}
      {error && !data && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="text-sm font-medium text-red-600 dark:text-red-400 text-center">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="text-xs font-bold text-emerald-600 hover:underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Data table: 1 columna fija "Concepto" + 13 columnas semana */}
      {data && data.weeks.length > 0 && (
        <div className="overflow-x-auto -mx-1 px-1 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-card">
          <table className="w-full min-w-[1100px] text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-white/10">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-gray-50 dark:bg-card/80 text-left py-3 px-3 text-[10px] font-bold text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-white/10"
                >
                  Concepto
                </th>
                {weekHeaders.map((h) => (
                  <th
                    scope="col"
                    key={h.number}
                    className={cn(
                      "py-3 px-2 text-right text-[10px] font-bold",
                      h.isNegative
                        ? "text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-900/10"
                        : "text-gray-500 dark:text-gray-400",
                    )}
                  >
                    <div className="flex flex-col items-end">
                      <span>S{h.number}</span>
                      <span className="text-[9px] font-normal text-gray-400">
                        {formatShortDate(h.start)}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const isClosing = row.key === "closingBalance";
                return (
                  <tr
                    key={row.key}
                    className={cn(
                      "border-b border-gray-100 dark:border-white/5",
                      isClosing &&
                        "bg-gray-50 dark:bg-white/5 border-t-2 border-gray-300 dark:border-white/20",
                    )}
                  >
                    <th
                      scope="row"
                      className={cn(
                        "sticky left-0 z-10 text-left py-3 px-3 text-xs font-bold border-r border-gray-200 dark:border-white/10",
                        isClosing
                          ? "bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white"
                          : "bg-white dark:bg-card text-gray-700 dark:text-gray-300",
                      )}
                    >
                      <span className="mr-1 text-gray-400">{row.sign}</span>
                      {row.label}
                    </th>
                    {data.weeks.map((w) => {
                      const value = w[row.key];
                      const weekCellNegative =
                        isClosing && w.closingBalance < 0;
                      return (
                        <td
                          key={w.weekNumber}
                          className={cn(
                            "py-3 px-2 text-right font-mono text-xs",
                            weekCellNegative &&
                              "bg-red-100 dark:bg-red-900/30",
                            row.tone === "positive" &&
                              !isClosing &&
                              "text-emerald-600 dark:text-emerald-400",
                            row.tone === "negative" &&
                              !isClosing &&
                              "text-red-500 dark:text-red-400",
                            row.tone === "neutral" &&
                              "text-gray-700 dark:text-gray-300",
                            row.tone === "bold" &&
                              (weekCellNegative
                                ? "text-red-700 dark:text-red-300 font-bold"
                                : "text-gray-900 dark:text-white font-bold"),
                          )}
                        >
                          {formatCurrency(value)}
                          {weekCellNegative && (
                            <TrendingDown
                              className="inline-block ml-1 h-3 w-3 text-red-500"
                              aria-label="saldo negativo"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {data && data.weeks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <AlertTriangle className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Sin datos para proyectar
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-sm">
            Registra cobros, fiados o pagos a proveedores para ver tu flujo de
            caja rodante.
          </p>
        </div>
      )}
    </div>
  );
}
