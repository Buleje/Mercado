"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  Inbox,
  Pause,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const QUEUE_LABELS: Record<string, string> = {
  email: "Correos Electrónicos",
  "pdf-generation": "Generación de PDF",
  notification: "Notificaciones",
  "activity-log": "Registro de Actividad",
  "stock-sync": "Sincronización de Stock",
};

const AUTO_REFRESH_MS = 10_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatQueueName(name: string): string {
  return QUEUE_LABELS[name] ?? name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function totalJobs(q: QueueStats): number {
  return q.waiting + q.active + q.completed + q.failed + q.delayed;
}

// ── Badge Component ──────────────────────────────────────────────────────────

interface BadgeProps {
  label: string;
  value: number;
  colorClasses: string;
  icon: React.ReactNode;
}

function StatBadge({ label, value, colorClasses, icon }: BadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
        colorClasses,
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="ml-auto font-bold tabular-nums">{value.toLocaleString("es-PE")}</span>
    </div>
  );
}

// ── Queue Card ───────────────────────────────────────────────────────────────

function QueueCard({ queue }: { queue: QueueStats }) {
  const total = totalJobs(queue);
  const hasFailed = queue.failed > 0;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md",
        "dark:border-gray-700 dark:bg-gray-800",
        hasFailed && "border-red-300 dark:border-red-700",
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {formatQueueName(queue.name)}
          </h3>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          {total.toLocaleString("es-PE")} total
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <StatBadge
          label="En espera"
          value={queue.waiting}
          colorClasses="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatBadge
          label="Activos"
          value={queue.active}
          colorClasses="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
          icon={<Loader2 className="h-4 w-4" />}
        />
        <StatBadge
          label="Completados"
          value={queue.completed}
          colorClasses="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
          icon={<CheckCircle className="h-4 w-4" />}
        />
        <StatBadge
          label="Fallidos"
          value={queue.failed}
          colorClasses={cn(
            "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
            hasFailed && "ring-1 ring-red-300 dark:ring-red-700",
          )}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatBadge
          label="Retrasados"
          value={queue.delayed}
          colorClasses="bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400"
          icon={<Pause className="h-4 w-4" />}
        />
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ColasTab() {
  const [stats, setStats] = useState<QueueStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchStats = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/queues", { credentials: "include" });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const json = await res.json();
      const data: QueueStats[] = json.data ?? [];
      setStats(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Auto-refresh ─────────────────────────────────────────────────────────

  useEffect(() => {
    fetchStats(true);
  }, [fetchStats]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchStats(false), AUTO_REFRESH_MS);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchStats]);

  // ── Render: Loading state ────────────────────────────────────────────────

  if (loading && stats.length === 0) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
        <span className="ml-3 text-gray-500 dark:text-gray-400">Cargando estadísticas de colas...</span>
      </div>
    );
  }

  // ── Render: Error state ──────────────────────────────────────────────────

  if (error && stats.length === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-10 w-10 text-red-500" />
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => fetchStats(true)}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // ── Render: No Redis / Empty queues ──────────────────────────────────────

  if (stats.length === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-center">
        <Inbox className="h-12 w-12 text-gray-400 dark:text-gray-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
          Colas deshabilitadas
        </h3>
        <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
          No se detectó conexión a Redis. Las colas de trabajo (BullMQ) requieren Redis para funcionar.
          Configura la variable de entorno <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-gray-700">REDIS_URL</code> para habilitar el procesamiento asíncrono.
        </p>
      </div>
    );
  }

  // ── Render: Stats ────────────────────────────────────────────────────────

  const totalWaiting = stats.reduce((sum, q) => sum + q.waiting, 0);
  const totalActive = stats.reduce((sum, q) => sum + q.active, 0);
  const totalFailed = stats.reduce((sum, q) => sum + q.failed, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Monitor de Colas
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Estado en tiempo real de las colas de procesamiento asíncrono
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Last updated */}
          {lastUpdated && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Actualizado: {lastUpdated.toLocaleTimeString("es-PE")}
            </span>
          )}

          {/* Auto-refresh toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              autoRefresh
                ? "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-900/20 dark:text-teal-400"
                : "border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400",
            )}
            title={autoRefresh ? "Desactivar auto-refresco" : "Activar auto-refresco"}
          >
            {autoRefresh ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {autoRefresh ? "Auto" : "Pausado"}
          </button>

          {/* Manual refresh */}
          <button
            type="button"
            onClick={() => fetchStats(false)}
            disabled={loading}
            className={cn(
              "flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white transition-colors",
              "hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-600",
            )}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refrescar
          </button>
        </div>
      </div>

      {/* Error banner (non-blocking — shown when we have stale data) */}
      {error && stats.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Error al actualizar: {error}. Mostrando datos anteriores.</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/10">
          <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
              {totalWaiting.toLocaleString("es-PE")}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">En espera (total)</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/10">
          <Activity className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {totalActive.toLocaleString("es-PE")}
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Activos (total)</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/10">
          <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
          <div>
            <p className="text-2xl font-bold text-red-700 dark:text-red-300">
              {totalFailed.toLocaleString("es-PE")}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400">Fallidos (total)</p>
          </div>
        </div>
      </div>

      {/* Queue cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {stats.map((queue) => (
          <QueueCard key={queue.name} queue={queue} />
        ))}
      </div>
    </div>
  );
}
