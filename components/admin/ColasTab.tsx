"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
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
} from "@buleje/design-system/icons";
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
        "rounded-xl border bg-white p-5  transition-shadow hover:shadow-sm",
        "dark:border-[var(--rule-base)] dark:bg-gray-800",
        hasFailed && "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]",
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[var(--accent)]" />
          <CardTitle className="text-base font-semibold text-[var(--text-primary)]">
            {formatQueueName(queue.name)}
          </CardTitle>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)] dark:bg-gray-700 dark:text-[var(--text-tertiary)]">
          {total.toLocaleString("es-PE")} total
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <StatBadge
          label="En espera"
          value={queue.waiting}
          colorClasses="bg-amber-50 text-[var(--data-warning-700)] dark:bg-amber-900/20 dark:text-amber-400"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatBadge
          label="Activos"
          value={queue.active}
          colorClasses="bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]"
          icon={<Loader2 className="h-4 w-4" />}
        />
        <StatBadge
          label="Completados"
          value={queue.completed}
          colorClasses="bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]"
          icon={<CheckCircle className="h-4 w-4" />}
        />
        <StatBadge
          label="Fallidos"
          value={queue.failed}
          colorClasses={cn(
            "bg-red-50 text-[var(--data-error-700)] dark:bg-red-900/20 dark:text-red-400",
            hasFailed && "ring-1 ring-red-300 dark:ring-[var(--data-error-700)]",
          )}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatBadge
          label="Retrasados"
          value={queue.delayed}
          colorClasses="bg-gray-100 text-[var(--text-secondary)] dark:bg-gray-700/50 dark:text-[var(--text-tertiary)]"
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
    return <LoadingState message="Cargando estadísticas de colas..." />;
  }

  // ── Render: Error state ──────────────────────────────────────────────────

  if (error && stats.length === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-10 w-10 text-[var(--data-error-500)]" />
        <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</p>
        <button
          type="button"
          onClick={() => fetchStats(true)}
          className="rounded-lg bg-[var(--accent-dark)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-dark)] dark:bg-[var(--accent)] dark:hover:bg-[var(--accent-dark)]"
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
        <Inbox className="h-12 w-12 text-[var(--text-tertiary)]" />
        <CardTitle className="text-lg font-semibold text-[var(--text-secondary)]">
          Colas deshabilitadas
        </CardTitle>
        <p className="max-w-md text-sm text-[var(--text-tertiary)]">
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
          <SectionTitle className="text-xl font-bold text-[var(--text-primary)]">
            Monitor de Colas
          </SectionTitle>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            Estado en tiempo real de las colas de procesamiento asíncrono
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Last updated */}
          {lastUpdated && (
            <span className="text-xs text-[var(--text-tertiary)]">
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
                ? "border-teal-300 bg-teal-50 text-[var(--accent-dark)] dark:border-[var(--accent-dark)] dark:bg-teal-900/20 dark:text-teal-400"
                : "border-[var(--rule-base)] bg-gray-50 text-[var(--text-secondary)] dark:border-gray-600 dark:bg-gray-800 dark:text-[var(--text-tertiary)]",
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
              "flex items-center gap-1.5 rounded-lg bg-[var(--accent-dark)] px-4 py-1.5 text-sm font-medium text-white transition-colors",
              "hover:bg-[var(--accent-dark)] disabled:opacity-50 dark:bg-[var(--accent)] dark:hover:bg-[var(--accent-dark)]",
            )}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refrescar
          </button>
        </div>
      </div>

      {/* Error banner (non-blocking — shown when we have stale data) */}
      {error && stats.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-2 text-sm text-[var(--data-error-500)] dark:border-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/20 dark:text-[var(--data-error-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Error al actualizar: {error}. Mostrando datos anteriores.</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border bg-[var(--data-warning-50)] p-4 dark:border-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/10">
          <Clock className="h-8 w-8 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" />
          <div>
            <p className="text-2xl font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
              {totalWaiting.toLocaleString("es-PE")}
            </p>
            <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">En espera (total)</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-[var(--accent-soft)] p-4 dark:border-[var(--data-success-500)]/30 dark:bg-[var(--accent-muted)]">
          <Activity className="h-8 w-8 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" />
          <div>
            <p className="text-2xl font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
              {totalActive.toLocaleString("es-PE")}
            </p>
            <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Activos (total)</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-[var(--data-error-50)] p-4 dark:border-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/10">
          <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" />
          <div>
            <p className="text-2xl font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
              {totalFailed.toLocaleString("es-PE")}
            </p>
            <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">Fallidos (total)</p>
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
