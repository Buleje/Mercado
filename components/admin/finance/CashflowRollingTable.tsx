"use client";

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  RefreshCw,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from "@buleje/design-system/icons";
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
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-white flex items-center justify-center  shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <SectionTitle className="text-lg font-bold text-[var(--text-primary)]">
              Flujo de caja — 13 semanas
            </SectionTitle>
            <p className="text-xs text-[var(--text-tertiary)]">
              Proyección rodante. Actualizado al{" "}
              {data ? formatShortDate(data.generatedAt) : "..."}.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchData()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-primary/10 hover:bg-primary/10 disabled:opacity-50  transition-colors shrink-0 min-h-[44px]"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {/* Critical week alert */}
      {criticalWeek !== null && data && (
        <div className="flex items-start gap-3 p-4 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:border-[var(--data-error-500)] dark:bg-red-950/40">
          <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
              Alerta: en la semana {criticalWeek} tu caja podría caer en
              negativo.
            </p>
            <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] mt-1">
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
        <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--rule-base)] dark:border-white/10 bg-[var(--surface-raised)]">
          <div>
            <p className="text-xs font-bold text-[var(--text-tertiary)]">
              Saldo hoy
            </p>
            <p className="text-2xl font-bold text-[var(--text-primary)] mt-1 font-mono">
              {formatCurrency(data.startingBalance)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-[var(--text-tertiary)]">
              Semanas sanas
            </p>
            <p className="text-2xl font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mt-1">
              {data.weeks.filter((w) => !w.isNegative).length} / 13
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <LoadingState />
      )}

      {/* Error */}
      {error && !data && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
          <p className="text-sm font-medium text-[var(--data-error-500)] dark:text-[var(--data-error-500)] text-center">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="text-xs font-bold text-[var(--data-success-500)] hover:underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Data table: 1 columna fija "Concepto" + 13 columnas semana */}
      {data && data.weeks.length > 0 && (
        <div className="overflow-x-auto -mx-1 px-1 rounded-xl border border-[var(--rule-base)] dark:border-white/10 bg-[var(--surface-raised)]">
          <table className="w-full min-w-[1100px] text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--rule-base)] dark:border-white/10">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-gray-50 dark:bg-[var(--surface-raised)]/80 text-left py-3 px-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] border-r border-[var(--rule-base)] dark:border-white/10"
                >
                  Concepto
                </th>
                {weekHeaders.map((h) => (
                  <th
                    scope="col"
                    key={h.number}
                    className={cn(
                      "py-3 px-2 text-right text-[length:var(--ts-2xs)] font-bold",
                      h.isNegative
                        ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)] bg-[var(--data-error-50)]/50 dark:bg-[var(--data-error-500)]/10"
                        : "text-[var(--text-tertiary)]",
                    )}
                  >
                    <div className="flex flex-col items-end">
                      <span>S{h.number}</span>
                      <span className="text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">
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
                      "border-b border-[var(--rule-soft)] dark:border-white/5",
                      isClosing &&
                        "bg-gray-50 dark:bg-white/5 border-t-2 border-[var(--rule-base)] dark:border-white/20",
                    )}
                  >
                    <th
                      scope="row"
                      className={cn(
                        "sticky left-0 z-10 text-left py-3 px-3 text-xs font-bold border-r border-[var(--rule-base)] dark:border-white/10",
                        isClosing
                          ? "bg-gray-100 dark:bg-white/10 text-[var(--text-primary)]"
                          : "bg-[var(--surface-raised)] text-[var(--text-secondary)]",
                      )}
                    >
                      <span className="mr-1 text-[var(--text-tertiary)]">{row.sign}</span>
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
                              "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30",
                            row.tone === "positive" &&
                              !isClosing &&
                              "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
                            row.tone === "negative" &&
                              !isClosing &&
                              "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
                            row.tone === "neutral" &&
                              "text-[var(--text-secondary)]",
                            row.tone === "bold" &&
                              (weekCellNegative
                                ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-bold"
                                : "text-[var(--text-primary)] font-bold"),
                          )}
                        >
                          {formatCurrency(value)}
                          {weekCellNegative && (
                            <TrendingDown
                              className="inline-block ml-1 h-3 w-3 text-[var(--data-error-500)]"
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
          <AlertTriangle className="h-8 w-8 text-[var(--text-tertiary)]" />
          <p className="text-sm font-medium text-[var(--text-tertiary)]">
            Sin datos para proyectar
          </p>
          <p className="text-xs text-[var(--text-tertiary)] text-center max-w-sm">
            Registra cobros, fiados o pagos a proveedores para ver tu flujo de
            caja rodante.
          </p>
        </div>
      )}
    </div>
  );
}
