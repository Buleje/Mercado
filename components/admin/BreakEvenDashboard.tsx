"use client";
import { SectionTitle } from "@buleje/design-system";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo } from "react";
import { Target, Clock, TrendingUp, Loader2, AlertTriangle, RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/* ── Helpers ── */
const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

/* ── Types ── */
type SaleRecord = {
  id: string;
  total: number;
  createdAt: string;
};

type ExpenseRecord = {
  id: string;
  amount: number;
  recurring: boolean;
  date: string;
};

/* ── Component ── */
export default function BreakEvenDashboard() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = () => {
    setLoading(true);
    setError(null);
    const today = new Date().toISOString().split("T")[0];

    Promise.all([
      fetch(`/api/sales?date=${today}&limit=500`).then((r) => r.ok ? r.json() : []),
      fetch("/api/expenses/summary?limit=200").then((r) => r.ok ? r.json() : []),
    ])
      .then(([salesData, expData]) => {
        const salesRows: SaleRecord[] = Array.isArray(salesData)
          ? salesData
          : salesData?.sales ?? [];
        const expRows: ExpenseRecord[] = Array.isArray(expData)
          ? expData
          : expData?.expenses ?? [];
        setSales(salesRows);
        setExpenses(expRows);
        setLastRefresh(new Date());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5 * 60 * 1000); // refresca cada 5 min
    return () => clearInterval(interval);
  }, []);

  /* ── Calculos ── */
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Ventas de hoy
    const todaySales = sales.filter((s) =>
      s.createdAt.startsWith(todayStr)
    );
    const totalSalesToday = todaySales.reduce((s, r) => s + r.total, 0);

    // Costos fijos del mes (gastos recurrentes)
    const monthlyFixed = expenses
      .filter((e) => e.recurring)
      .reduce((s, e) => s + e.amount, 0);
    const dailyFixed = monthlyFixed / 30;

    // Progreso
    const progress = dailyFixed > 0 ? (totalSalesToday / dailyFixed) * 100 : 0;
    const reached = totalSalesToday >= dailyFixed;
    const remaining = Math.max(0, dailyFixed - totalSalesToday);

    // Hora estimada de break-even
    const hoursElapsed =
      now.getHours() + now.getMinutes() / 60 - 6; // asume apertura 6am
    const hoursOpen = Math.max(0.5, hoursElapsed);
    const salesPerHour = totalSalesToday / hoursOpen;
    let estimatedHour: string | null = null;
    if (!reached && salesPerHour > 0) {
      const hoursToBreakEven = remaining / salesPerHour;
      const breakEvenTime = new Date(now.getTime() + hoursToBreakEven * 3600000);
      estimatedHour = breakEvenTime.toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    return {
      totalSalesToday,
      dailyFixed,
      monthlyFixed,
      progress: Math.min(100, progress),
      reached,
      remaining,
      estimatedHour,
      salesPerHour,
      transactionCount: todaySales.length,
    };
  }, [sales, expenses]);

  /* ── Render ── */
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-[#00B4A6]" />
          <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">
            Punto de Equilibrio Diario
          </SectionTitle>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[#00B4A6] dark:hover:text-[#2dd4bf] transition-colors"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          {lastRefresh.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/20 text-[var(--data-error)] dark:text-[var(--data-error)] px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-[var(--text-tertiary)]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Calculando punto de equilibrio...
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Tarjetas principales */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
              <p className="text-xs text-[var(--text-tertiary)] mb-1">
                Ventas de hoy
              </p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                {fmt(stats.totalSalesToday)}
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                {stats.transactionCount} transacciones
              </p>
            </div>

            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
              <p className="text-xs text-[var(--text-tertiary)] mb-1">
                Costo fijo diario
              </p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                {fmt(stats.dailyFixed)}
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                {fmt(stats.monthlyFixed)}/mes entre 30 dias
              </p>
            </div>

            <div
              className={cn(
                "rounded-xl border p-4",
                stats.reached
                  ? "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]"
                  : "border-[var(--data-error)] dark:border-[var(--data-error)] bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/10"
              )}
            >
              <p
                className={cn(
                  "text-xs mb-1 font-medium",
                  stats.reached
                    ? "text-[var(--data-success)] dark:text-[var(--data-success)]"
                    : "text-[var(--data-error)] dark:text-[var(--data-error)]"
                )}
              >
                {stats.reached ? "Punto alcanzado" : "Falta cubrir"}
              </p>
              <p
                className={cn(
                  "text-2xl font-bold",
                  stats.reached
                    ? "text-[var(--data-success)] dark:text-[var(--data-success)]"
                    : "text-[var(--data-error)] dark:text-[var(--data-error)]"
                )}
              >
                {stats.reached ? "Ganando" : fmt(stats.remaining)}
              </p>
              <p
                className={cn(
                  "text-xs mt-1",
                  stats.reached
                    ? "text-[var(--data-success)] dark:text-[var(--data-success)]"
                    : "text-[var(--data-error)] dark:text-[var(--data-error)]"
                )}
              >
                {stats.reached
                  ? "Todo lo que vendes es ganancia"
                  : "Para cubrir costos fijos"}
              </p>
            </div>
          </div>

          {/* Barra de progreso */}
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-[var(--text-secondary)]">
                Progreso hacia el punto de equilibrio
              </span>
              <span
                className={cn(
                  "font-bold",
                  stats.reached
                    ? "text-[var(--data-success)] dark:text-[var(--data-success)]"
                    : "text-[var(--data-error)] dark:text-[var(--data-error)]"
                )}
              >
                {stats.progress.toFixed(1)}%
              </span>
            </div>

            <div className="relative h-6 w-full rounded-full bg-[var(--surface-sunken)] overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-[var(--dur-slower)]",
                  stats.reached
                    ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-soft)]"
                    : stats.progress > 60
                    ? "bg-[var(--data-warning)] dark:bg-[var(--data-warning)]"
                    : "bg-[var(--data-error)] dark:bg-[var(--data-error)]"
                )}
                style={{ width: `${stats.progress}%` }}
              />
              {/* Marcador 100% */}
              <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-gray-400 dark:bg-gray-500" />
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
              <span>S/ 0</span>
              <span className="font-medium text-[var(--text-secondary)]">
                Meta: {fmt(stats.dailyFixed)}
              </span>
            </div>
          </div>

          {/* Estimacion de hora */}
          <div
            className={cn(
              "rounded-xl border p-4 flex items-center gap-3",
              stats.reached
                ? "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]"
                : "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]"
            )}
          >
            <Clock
              className={cn(
                "w-5 h-5 shrink-0",
                stats.reached
                  ? "text-[var(--data-success)] dark:text-[var(--data-success)]"
                  : "text-[var(--data-success)] dark:text-[var(--data-success)]"
              )}
            />
            <div>
              {stats.reached ? (
                <p className="text-sm font-medium text-[var(--data-success)] dark:text-[var(--data-success)]">
                  Ya cubriste los costos fijos del dia. Cada sol adicional es ganancia.
                </p>
              ) : stats.estimatedHour ? (
                <p className="text-sm font-medium text-[var(--data-success)] dark:text-[var(--data-success)]">
                  Si sigues vendiendo a este ritmo ({fmt(stats.salesPerHour)}/hora), cubres costos
                  a las{" "}
                  <span className="font-bold text-[#00B4A6] dark:text-[#2dd4bf]">
                    {stats.estimatedHour}
                  </span>
                  .
                </p>
              ) : (
                <p className="text-sm text-[var(--data-success)] dark:text-[var(--data-success)]">
                  Registra ventas para estimar la hora de equilibrio.
                </p>
              )}
            </div>
          </div>

          {/* Ritmo de ventas */}
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-[#00B4A6]" />
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                Ritmo actual de ventas
              </span>
            </div>
            <p className="text-xl font-bold text-[var(--text-primary)]">
              {fmt(stats.salesPerHour)}/hora
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              Necesitas {fmt(stats.dailyFixed / 12)}/hora para cerrar en break-even a las 6pm
            </p>
          </div>
        </>
      )}
    </div>
  );
}
