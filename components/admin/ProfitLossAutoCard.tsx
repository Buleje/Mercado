"use client";

import { useState, useEffect, useCallback } from "react";
import { DollarSign, Loader2, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type DailyReport = {
  totalSales?: number;
  [key: string]: unknown;
};

type ExpenseSummary = {
  total?: number;
  byCategory?: Record<string, number>;
  [key: string]: unknown;
};

type Sale = {
  id: string;
  createdAt: string;
  total: number;
  items?: { price: number; quantity: number; costPrice?: number }[];
};

type PLRow = {
  label: string;
  amount: number;
  isSubtract?: boolean;
  isFinal?: boolean;
  indent?: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getCurrentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function estimateCOGS(sales: Sale[]): number {
  // Si hay costPrice en items, usar ese; si no, estimar 60% del precio de venta
  let cogs = 0;
  for (const s of sales) {
    for (const item of s.items ?? []) {
      const cost = item.costPrice != null
        ? item.costPrice * item.quantity
        : item.price * item.quantity * 0.6;
      cogs += cost;
    }
  }
  return cogs;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ProfitLossAutoCard() {
  const [_report, setReport] = useState<DailyReport | null>(null);
  const [expenses, setExpenses] = useState<ExpenseSummary | null>(null);
  const [monthlySales, setMonthlySales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, expRes, salesRes] = await Promise.all([
        fetch("/api/daily-report").then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/expenses/summary").then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/sales").then(r => r.ok ? r.json() : []).catch(() => []),
      ]);

      setReport(dashRes);
      setExpenses(expRes);

      const { start, end } = getCurrentMonthRange();
      const all: Sale[] = Array.isArray(salesRes) ? salesRes : [];
      setMonthlySales(all.filter(s => {
        const d = new Date(s.createdAt);
        return d >= start && d <= end;
      }));
    } catch {
      setError("No se pudo cargar el estado de resultados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Calculos P&L
  const revenue = monthlySales.reduce((sum, s) => sum + (s.total ?? 0), 0);
  const cogs = estimateCOGS(monthlySales);
  const grossProfit = revenue - cogs;
  const operatingExpenses = expenses?.total ?? 0;
  const netProfit = grossProfit - operatingExpenses;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  const rows: PLRow[] = [
    { label: "Ingresos (ventas del mes)", amount: revenue },
    { label: "Costo de productos (COGS)", amount: cogs, isSubtract: true, indent: true },
    { label: "Gastos operativos", amount: operatingExpenses, isSubtract: true, indent: true },
    { label: "UTILIDAD NETA", amount: netProfit, isFinal: true },
  ];

  const now = new Date();
  const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const periodLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900  overflow-hidden">
      {/* Header */}
      <div className="bg-[#00B4A6] px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-white" />
          <span className="text-white font-semibold text-sm">Estado de Resultados</span>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="text-white/70 hover:text-white transition-colors"
          aria-label="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Periodo */}
      <div className="px-5 pt-3 pb-0">
        <p className="text-xs text-gray-500 dark:text-gray-400">{periodLabel}</p>
      </div>

      {/* Body */}
      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-[#00B4A6]" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-500 dark:text-red-400 text-center py-6">{error}</p>
        ) : (
          <div className="space-y-2">
            {/* Tabla P&L */}
            {rows.map((row, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center justify-between py-2",
                  row.isFinal
                    ? "border-t-2 border-gray-300 dark:border-gray-600 pt-3 mt-2"
                    : i < rows.length - 2
                    ? "border-b border-gray-100 dark:border-gray-800"
                    : ""
                )}
              >
                <span
                  className={cn(
                    "text-sm",
                    row.indent && "pl-3 text-gray-500 dark:text-gray-400",
                    row.isFinal && "font-bold text-gray-900 dark:text-white",
                    !row.indent && !row.isFinal && "text-gray-700 dark:text-gray-300"
                  )}
                >
                  {row.isSubtract && (
                    <span className="text-gray-400 mr-1">-</span>
                  )}
                  {row.label}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    row.isFinal
                      ? netProfit >= 0
                        ? "text-emerald-600 dark:text-emerald-400 text-base"
                        : "text-red-500 dark:text-red-400 text-base"
                      : row.isSubtract
                      ? "text-red-500 dark:text-red-400"
                      : "text-gray-800 dark:text-gray-200"
                  )}
                >
                  {row.isSubtract ? `- ${fmt(row.amount)}` : fmt(row.amount)}
                </span>
              </div>
            ))}

            {/* Margen neto */}
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">Margen neto</span>
                <div className={cn(
                  "flex items-center gap-1 text-sm font-bold",
                  netMargin >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-500 dark:text-red-400"
                )}>
                  {netMargin >= 0
                    ? <TrendingUp className="h-4 w-4" />
                    : <TrendingDown className="h-4 w-4" />
                  }
                  {netMargin >= 0 ? "+" : ""}{netMargin.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Aviso COGS estimado */}
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
              COGS calculado sobre costo registrado o estimado al 60% si no hay precio de costo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
