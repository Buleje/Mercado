"use client";

/**
 * BreakEvenDashboard — Punto de equilibrio diario rediseñado.
 *
 * Mejoras (2026-04-20):
 *   - AdminModuleHeader estandar (eyebrow + PageTitle font-display + description)
 *   - Hero card con RadialBarChart Recharts (gauge profesional) + 4 KPIs inline
 *   - 3 KPI cards alineados al patron einvoice (label uppercase + value text-xl
 *     font-extrabold + intent en color cuando aplica)
 *   - Footer card "Ritmo & estimacion" con icon de accent-soft
 *   - Tokens estrictos. Auto-refresh cada 5 min preservado.
 */

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Target,
  Clock,
  TrendingUp,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const BreakEvenGauge = dynamic(() => import("./BreakEvenGauge"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-40 w-40 animate-pulse rounded-full bg-[var(--color-muted)]" />
    </div>
  ),
});
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

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
      fetch(`/api/sales?date=${today}&limit=500`).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/expenses/summary?limit=200").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([salesData, expData]) => {
        const salesRows: SaleRecord[] = Array.isArray(salesData)
          ? salesData
          : (salesData?.sales ?? []);
        const expRows: ExpenseRecord[] = Array.isArray(expData)
          ? expData
          : (expData?.expenses ?? []);
        setSales(salesRows);
        setExpenses(expRows);
        setLastRefresh(new Date());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const todaySales = sales.filter((s) => s.createdAt.startsWith(todayStr));
    const totalSalesToday = todaySales.reduce((s, r) => s + r.total, 0);

    const monthlyFixed = expenses
      .filter((e) => e.recurring)
      .reduce((s, e) => s + e.amount, 0);
    const dailyFixed = monthlyFixed / 30;

    const progress = dailyFixed > 0 ? (totalSalesToday / dailyFixed) * 100 : 0;
    const reached = totalSalesToday >= dailyFixed;
    const remaining = Math.max(0, dailyFixed - totalSalesToday);

    const hoursElapsed = now.getHours() + now.getMinutes() / 60 - 6;
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

  return (
    <div className="space-y-3 sm:space-y-6">
      <AdminModuleHeader
        eyebrow="Rentabilidad · Hoy"
        title="Punto de equilibrio diario"
        description="Cuanto necesitas vender hoy para cubrir tus costos fijos. Refresco automatico cada 5 min."
        icon={Target}
      >
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {lastRefresh.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
        </button>
      </AdminModuleHeader>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 px-4 py-3 text-[length:var(--ts-sm)] text-[var(--data-error-500)]">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-[var(--text-tertiary)]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Calculando punto de equilibrio...
        </div>
      )}

      {!loading && !error && (
        <>
          {/* HERO con gauge + 4 KPIs inline */}
          <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-7">
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 lg:gap-8 items-center">
              {/* Gauge RadialBarChart — lazy */}
              <div className="relative" style={{ height: 240 }}>
                <BreakEvenGauge progress={stats.progress} reached={stats.reached} />
              </div>

              {/* 4 KPIs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
                    Ventas hoy
                  </p>
                  <p className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
                    {fmt(stats.totalSalesToday)}
                  </p>
                  <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-1">
                    {stats.transactionCount} transacciones
                  </p>
                </div>
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
                    Costo fijo diario
                  </p>
                  <p className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
                    {fmt(stats.dailyFixed)}
                  </p>
                  <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-1">
                    {fmt(stats.monthlyFixed)} / mes ÷ 30
                  </p>
                </div>
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
                    {stats.reached ? "Estado" : "Falta cubrir"}
                  </p>
                  <p
                    className={cn(
                      "text-2xl font-extrabold tabular-nums",
                      stats.reached
                        ? "text-[var(--data-success-500)]"
                        : "text-[var(--data-error-500)]",
                    )}
                  >
                    {stats.reached ? "Ganando" : fmt(stats.remaining)}
                  </p>
                  <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-1">
                    {stats.reached
                      ? "Cada sol es ganancia"
                      : "Para cubrir costos"}
                  </p>
                </div>
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
                    Ritmo
                  </p>
                  <p className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
                    {fmt(stats.salesPerHour)}
                  </p>
                  <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-1">por hora</p>
                </div>
              </div>
            </div>
          </div>

          {/* Estimacion / mensaje contextual */}
          <div
            className={cn(
              "rounded-xl border p-4 flex items-start gap-3",
              stats.reached
                ? "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5"
                : "border-[var(--accent)]/30 bg-primary/10",
            )}
          >
            <span
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                stats.reached
                  ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]"
                  : "bg-[var(--accent)]/15 text-[var(--accent)]",
              )}
            >
              <Clock className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              {stats.reached ? (
                <p className="text-[length:var(--ts-sm)] font-semibold text-[var(--data-success-500)]">
                  Ya cubriste los costos fijos del dia. Cada sol adicional es ganancia neta.
                </p>
              ) : stats.estimatedHour ? (
                <p className="text-[length:var(--ts-sm)] font-medium text-[var(--text-secondary)]">
                  Si seguis vendiendo a este ritmo ({fmt(stats.salesPerHour)}/hora), cubris costos a las{" "}
                  <span className="font-extrabold tabular-nums text-[var(--accent)]">
                    {stats.estimatedHour}
                  </span>
                  . Necesitas {fmt(stats.dailyFixed / 12)}/hora para cerrar a las 6pm.
                </p>
              ) : (
                <p className="text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
                  Registra ventas para estimar la hora de equilibrio.
                </p>
              )}
            </div>
          </div>

          {/* Ritmo de ventas (card secundario) */}
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
              <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-0.5">
                Ritmo actual de ventas
              </p>
              <p className="text-base font-bold text-[var(--text-primary)] tabular-nums">
                {fmt(stats.salesPerHour)} / hora
              </p>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-0.5">
                Necesitas {fmt(stats.dailyFixed / 12)}/hora para cerrar en break-even a las 6pm.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
