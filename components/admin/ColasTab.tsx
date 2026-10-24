"use client";

import { CardTitle, LoadingState, StatCard } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EmptyState } from "@/components/admin/EmptyState";
import { button } from "@/components/ui-system/button-variants";
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
import { formatNumber, formatTime } from "@/lib/format";

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
        "flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
        colorClasses,
      )}
    >
      {icon}
      <span className="min-w-0 truncate" title={label}>{label}</span>
      <span className="ml-auto shrink-0 pl-1 font-bold tabular-nums">{formatNumber(value)}</span>
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
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 transition-shadow hover:shadow-[var(--shadow-sm)]",
        hasFailed && "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]",
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[var(--accent)]" />
          <CardTitle>
            {formatQueueName(queue.name)}
          </CardTitle>
        </div>
        <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-tertiary)]">
          {formatNumber(total)} total
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatBadge
          label="En espera"
          value={queue.waiting}
          colorClasses="bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)]"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatBadge
          label="Activos"
          value={queue.active}
          colorClasses="bg-[var(--data-success-500)]/10 text-[var(--data-success-ink)]"
          icon={<Loader2 className="h-4 w-4" />}
        />
        <StatBadge
          label="Completados"
          value={queue.completed}
          colorClasses="bg-[var(--data-success-500)]/10 text-[var(--data-success-ink)]"
          icon={<CheckCircle className="h-4 w-4" />}
        />
        <StatBadge
          label="Fallidos"
          value={queue.failed}
          colorClasses={cn(
            "bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)]",
            hasFailed && "ring-1 ring-[var(--data-error-500)]/50",
          )}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatBadge
          label="Retrasados"
          value={queue.delayed}
          colorClasses="bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-tertiary)]"
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
        <p className="text-sm text-[var(--data-error-ink)]">{error}</p>
        <button type="button" onClick={() => fetchStats(true)} className={button({ variant: "secondary", className: "rounded-xl" })}>
          Reintentar
        </button>
      </div>
    );
  }

  // ── Render: No Redis / Empty queues ──────────────────────────────────────

  if (stats.length === 0) {
    return (
      <div className="space-y-3">
        {/* Ola 2 del panel unificado: la explicación va al ⓘ (regla «explicar
            con ⓘ, no con párrafos»); a la vista, el estado en una frase. */}
        <div className="flex items-center gap-1.5">
          <CardTitle>Monitor de colas</CardTitle>
          <InfoTip
            title="Colas deshabilitadas"
            what="Las colas de trabajo (BullMQ) necesitan Redis para funcionar y no se detectó la conexión."
            example="Configura la variable de entorno REDIS_URL para habilitar el procesamiento en segundo plano."
          />
        </div>
        <EmptyState icon={<Inbox aria-hidden />} title="Colas deshabilitadas: falta conectar Redis." className="py-8" />
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
        {/* Un título por pantalla: dentro de Configuración › Sistema el título
            de la vista ya está arriba; éste es el de su bloque. */}
        <div className="flex items-center gap-1.5">
          <CardTitle>Monitor de colas</CardTitle>
          <InfoTip
            title="Monitor de colas"
            what="Estado en tiempo real de las colas de procesamiento en segundo plano."
            example="Si «Fallidos» sube, revisa abajo los crons que fallaron."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Last updated */}
          {lastUpdated && (
            <span className="text-xs text-[var(--text-tertiary)]">
              Actualizado: {formatTime(lastUpdated, { segundos: true })}
            </span>
          )}

          {/* Auto-refresh toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh((prev) => !prev)}
            aria-pressed={autoRefresh}
            className={button({
              variant: "secondary",
              className: cn("rounded-xl px-4", autoRefresh && "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"),
            })}
            title={autoRefresh ? "Pausar la actualización automática" : "Actualizar solo cada tanto"}
          >
            {autoRefresh ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {autoRefresh ? "Auto" : "Pausado"}
          </button>

          {/* Manual refresh */}
          <button
            type="button"
            onClick={() => fetchStats(false)}
            disabled={loading}
            className={button({ variant: "secondary", className: "rounded-xl px-4" })}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Error banner (non-blocking — shown when we have stale data) */}
      {error && stats.length > 0 && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-2 text-sm text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Error al actualizar: {error}. Mostrando datos anteriores.</span>
        </div>
      )}

      {/* Summary cards */}
      {/* Tres en una fila también a 400 px: apiladas eran una pantalla entera. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard density="compact" label="En espera" icon={Clock} iconEmphasis value={formatNumber(totalWaiting)} emphasis={totalWaiting > 0 ? "warning" : "neutral"} />
        <StatCard density="compact" label="Activos" icon={Activity} iconEmphasis value={formatNumber(totalActive)} emphasis={totalActive > 0 ? "success" : "neutral"} />
        <StatCard density="compact" label="Fallidos" icon={AlertTriangle} iconEmphasis value={formatNumber(totalFailed)} emphasis={totalFailed > 0 ? "error" : "neutral"} />
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
