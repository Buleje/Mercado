"use client";

import { useState, useEffect, useCallback } from "react";
import { Package, AlertTriangle, CheckCircle2, TrendingDown, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
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
      <div className="rounded-xl border border-gray-100 dark:border-card-border bg-white dark:bg-card p-3 sm:p-4 animate-pulse">
        <div className="h-3 w-20 bg-gray-200 dark:bg-surface rounded mb-3" />
        <div className="h-8 w-12 bg-gray-200 dark:bg-surface rounded" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border border-gray-100 dark:border-card-border bg-white dark:bg-card p-3 sm:p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center", bgClass)}>
          <Icon className={cn("h-3.5 w-3.5", colorClass)} />
        </div>
        <span className="text-[11px] font-medium text-gray-500 dark:text-muted leading-tight">{label}</span>
      </div>
      <span className={cn("text-2xl font-bold", colorClass)}>{value.toLocaleString("es-PE")}</span>
    </motion.div>
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
          colorClass: "text-emerald-600 dark:text-emerald-400",
          bgClass: "bg-emerald-50 dark:bg-emerald-900/30",
        },
        {
          label: "Por vencer (7 días)",
          value: stats.expiringWithin7Days,
          icon: AlertTriangle,
          colorClass:
            stats.expiringWithin7Days > 0
              ? "text-amber-600 dark:text-amber-400"
              : "text-emerald-600 dark:text-emerald-400",
          bgClass:
            stats.expiringWithin7Days > 0
              ? "bg-amber-50 dark:bg-amber-900/30"
              : "bg-emerald-50 dark:bg-emerald-900/30",
        },
        {
          label: "Vencidos con stock",
          value: stats.expiredWithStock,
          icon: TrendingDown,
          colorClass:
            stats.expiredWithStock > 0
              ? "text-red-600 dark:text-red-400"
              : "text-emerald-600 dark:text-emerald-400",
          bgClass:
            stats.expiredWithStock > 0
              ? "bg-red-50 dark:bg-red-900/30"
              : "bg-emerald-50 dark:bg-emerald-900/30",
        },
        {
          label: "Total unidades",
          value: stats.totalUnits,
          icon: Package,
          colorClass: "text-[#00B4A6] dark:text-emerald-400",
          bgClass: "bg-[#00B4A6]/10 dark:bg-emerald-900/30",
        },
      ]
    : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#00B4A6]/10 dark:bg-emerald-900/30 flex items-center justify-center">
            <Package className="h-3.5 w-3.5 text-[#00B4A6] dark:text-emerald-400" />
          </div>
          <h3 className="text-sm font-bold text-gray-800 dark:text-foreground">Lotes de inventario</h3>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          title="Actualizar"
          className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-xs text-red-600 dark:text-red-400">
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
