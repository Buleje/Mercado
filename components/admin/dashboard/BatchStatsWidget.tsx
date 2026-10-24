"use client";

import { CardTitle, StatCard, type StatCardEmphasis } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { Package, AlertTriangle, CheckCircle2, TrendingDown, RefreshCw, type LucideIcon } from "@buleje/design-system/icons";
import { m } from "@/components/admin/providers";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

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
// La tarjeta migró a `StatCard` (canon KPI 2026-09-22). El skeleton de carga
// queda fuera de la card (StatCard no tiene estado `loading`) — es un
// placeholder, no un feature de KPI. La "chip" circular de color detrás del
// ícono se pierde a propósito (rediseño minimalista de StatCard); el color de
// severidad se preserva con `iconEmphasis`.

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4 animate-pulse">
      <div className="h-3 w-20 bg-[var(--rule-base)] rounded mb-3" />
      <div className="h-8 w-12 bg-[var(--rule-base)] rounded" />
    </div>
  );
}

function AnimatedStatCard({
  label,
  value,
  icon,
  emphasis,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  emphasis: StatCardEmphasis;
}) {
  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <StatCard
        label={label}
        value={formatNumber(value)}
        icon={icon}
        emphasis={emphasis}
        iconEmphasis
        density="compact"
      />
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

  const cards: Array<{ label: string; value: number; icon: LucideIcon; emphasis: StatCardEmphasis }> = stats
    ? [
        {
          label: "Lotes activos",
          value: stats.activeBatches,
          icon: CheckCircle2,
          emphasis: "success",
        },
        {
          label: "Por vencer (7 días)",
          value: stats.expiringWithin7Days,
          icon: AlertTriangle,
          emphasis: stats.expiringWithin7Days > 0 ? "warning" : "success",
        },
        {
          label: "Vencidos con stock",
          value: stats.expiredWithStock,
          icon: TrendingDown,
          emphasis: stats.expiredWithStock > 0 ? "error" : "success",
        },
        {
          label: "Total unidades",
          value: stats.totalUnits,
          icon: Package,
          emphasis: "neutral",
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
          className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--rule-soft)] transition-colors disabled:opacity-40"
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
            ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
            : cards.map((c) => <AnimatedStatCard key={c.label} {...c} />)}
        </div>
      )}
    </div>
  );
}
