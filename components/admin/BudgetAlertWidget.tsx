"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type ExpenseSummary = {
  total?: number;
  byCategory?: Record<string, number>;
  [key: string]: unknown;
};

type AlertLevel = "ok" | "warning" | "danger";

// ── Props ──────────────────────────────────────────────────────────────────────

interface BudgetAlertWidgetProps {
  monthlyBudget?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getAlertLevel(pct: number): AlertLevel {
  if (pct >= 90) return "danger";
  if (pct >= 70) return "warning";
  return "ok";
}

const LEVEL_CONFIG: Record<AlertLevel, {
  bar: string;
  bg: string;
  border: string;
  text: string;
  label: string;
}> = {
  ok: {
    bar: "bg-emerald-500 dark:bg-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-emerald-200 dark:border-emerald-700",
    text: "text-emerald-800 dark:text-emerald-300",
    label: "Presupuesto bajo control",
  },
  warning: {
    bar: "bg-amber-500 dark:bg-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-700",
    text: "text-amber-800 dark:text-amber-300",
    label: "Atencion: presupuesto al 70%",
  },
  danger: {
    bar: "bg-red-500 dark:bg-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-700",
    text: "text-red-800 dark:text-red-300",
    label: "Alerta: presupuesto superado el 90%",
  },
};

// ── Main Component ─────────────────────────────────────────────────────────────

export default function BudgetAlertWidget({ monthlyBudget = 5000 }: BudgetAlertWidgetProps) {
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/expenses/summary");
      if (!res.ok) throw new Error("Error al obtener gastos");
      const json: ExpenseSummary = await res.json();
      setSummary(json);
    } catch {
      setError("No se pudo cargar el presupuesto.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const spent = summary?.total ?? 0;
  const remaining = Math.max(monthlyBudget - spent, 0);
  const pct = Math.min((spent / monthlyBudget) * 100, 100);
  const level = getAlertLevel(pct);
  const cfg = LEVEL_CONFIG[level];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        cfg.bg,
        cfg.border
      )}
    >
      {/* Titulo + refresh */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {level === "ok" ? (
            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className={cn(
              "h-4 w-4",
              level === "danger"
                ? "text-red-600 dark:text-red-400"
                : "text-amber-600 dark:text-amber-400"
            )} />
          )}
          <span className={cn("text-xs font-semibold", cfg.text)}>
            Presupuesto Mensual
          </span>
        </div>
        <button
          onClick={fetchSummary}
          disabled={loading}
          className={cn("transition-colors", cfg.text, "hover:opacity-70")}
          aria-label="Actualizar presupuesto"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      ) : (
        <div className="space-y-3">
          {/* Montos */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Gastado</p>
              <p className={cn("text-lg font-bold", cfg.text)}>{fmt(spent)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">Disponible</p>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{fmt(remaining)}</p>
            </div>
          </div>

          {/* Barra de progreso */}
          <div>
            <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500", cfg.bar)}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-gray-400">{pct.toFixed(0)}% usado</span>
              <span className="text-[10px] text-gray-400">Presupuesto: {fmt(monthlyBudget)}</span>
            </div>
          </div>

          {/* Mensaje de alerta cuando supera el 70% */}
          {level !== "ok" && (
            <div className={cn(
              "rounded-lg px-3 py-2 border",
              cfg.bg,
              cfg.border
            )}>
              <p className={cn("text-xs font-medium", cfg.text)}>{cfg.label}</p>
              {level === "danger" && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  Exceso: {fmt(Math.max(spent - monthlyBudget, 0))}
                </p>
              )}
            </div>
          )}

          {/* Desglose por categoria si existe */}
          {summary?.byCategory && Object.keys(summary.byCategory).length > 0 && (
            <div className="pt-1 border-t border-gray-200 dark:border-gray-700">
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Por categoria
              </p>
              <ul className="space-y-1">
                {Object.entries(summary.byCategory)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 4)
                  .map(([cat, amount]) => (
                    <li key={cat} className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-600 dark:text-gray-400 capitalize truncate max-w-[60%]">
                        {cat}
                      </span>
                      <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">
                        {fmt(amount)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
