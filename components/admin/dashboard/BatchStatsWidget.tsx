"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { Package, AlertTriangle, CheckCircle2, TrendingDown, RefreshCw } from "@buleje/design-system/icons";
import { m } from "@/components/admin/providers";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BatchStats {
  totalBatches: number;
  activeBatches: number;
  expiredWithStock: number;
  expiringWithin7Days: number;
  expiringWithin30Days: number;
  emptyBatches: number;
  totalUnits: number;
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  colorClass,
  bgClass,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  bgClass: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4 animate-pulse">
        <div className="h-3 w-20 bg-gray-200 dark:bg-surface rounded mb-3" />
        <div className="h-8 w-12 bg-gray-200 dark:bg-surface rounded" />
      </div>
    );
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center", bgClass)}>
          <Icon className={cn("h-3.5 w-3.5", colorClass)} />
        </div>
        <span className="text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)] dark:text-muted leading-tight">{label}</span>
      </div>
      <span className={cn("text-2xl font-bold", colorClass)}>{value.toLocaleString("es-PE")}</span>
    </m.div>
  );
}

// ── Widget principal ──────────────────────────────────────────────────────────

export default function BatchStatsWidget() {
  const [stats, setStats] = useState<BatchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/batches/stats");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: BatchStats = await res.json();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar estadísticas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const cards = stats
    ? [
        {
          label: "Lotes activos",
          value: stats.activeBatches,
          icon: CheckCircle2,
          colorClass: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
          bgClass: "bg-primary/10 dark:bg-primary/15",
        },
        {
          label: "Por vencer (7 días)",
          value: stats.expiringWithin7Days,
          icon: AlertTriangle,
          colorClass:
            stats.expiringWithin7Days > 0
              ? "text-[var(--data-warning-600)] dark:text-amber-400"
              : "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
          bgClass:
            stats.expiringWithin7Days > 0
              ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/30"
              : "bg-primary/10 dark:bg-primary/15",
        },
        {
          label: "Vencidos con stock",
          value: stats.expiredWithStock,
          icon: TrendingDown,
          colorClass:
            stats.expiredWithStock > 0
              ? "text-[var(--data-error-600)] dark:text-red-400"
              : "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
          bgClass:
            stats.expiredWithStock > 0
              ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/30"
              : "bg-primary/10 dark:bg-primary/15",
        },
        {
          label: "Total unidades",
          value: stats.totalUnits,
          icon: Package,
          colorClass: "text-primary dark:text-[var(--data-success-500)]",
          bgClass: "bg-primary/10 dark:bg-primary/15",
        },
      ]
    : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
            <Package className="h-3.5 w-3.5 text-primary dark:text-[var(--data-success-500)]" />
          </div>
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Lotes de inventario</CardTitle>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          title="Actualizar"
          className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-accent transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] dark:bg-red-950/20 px-4 py-3 text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
          {error} —{" "}
          <button onClick={fetchStats} className="underline font-medium">
            Reintentar
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <StatCard
                  key={i}
                  label=""
                  value={0}
                  icon={Package}
                  colorClass=""
                  bgClass=""
                  loading
                />
              ))
            : cards.map((c) => <StatCard key={c.label} {...c} loading={false} />)}
        </div>
      )}
    </div>
  );
}
