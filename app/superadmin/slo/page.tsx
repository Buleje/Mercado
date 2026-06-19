"use client";

/**
 * SLO Dashboard — Vercel + Sentry + PostHog + CronHealth, datos REALES.
 *
 * Datos vía /api/superadmin/slo/overview (server-side, lee los secrets) +
 * /api/superadmin/cron-health. Cada fuente reporta su estado honesto; si falta
 * una credencial, se muestra "no configurado · conectá X" — NUNCA datos mock.
 *
 * Activar fuentes (env):
 *   - Vercel  → VERCEL_TOKEN (+ VERCEL_TEAM_ID, VERCEL_PROJECT_ID)
 *   - Sentry  → SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT (valores reales,
 *               hoy hay placeholders tipo "tu-org-slug")
 *   - PostHog → POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID (+ POSTHOG_HOST)
 *   - CronHealth → ya funciona (lee de la DB)
 */

import { useState, useEffect, useCallback } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw,
  ShoppingCart, TrendingUp, XCircle, Zap, BarChart3, Cable,
} from "@buleje/design-system/icons";
import { AdminTabShell } from "../_components/_shared";
import { fmtTimeSafe, fmtDateTimeSafe } from "@/lib/superadmin/safe-helpers";

// ── Types ─────────────────────────────────────────────────────────────────────

type SloSourceStatus = "live" | "empty" | "not_configured" | "error";

interface DeployStatus {
  id: string;
  state: "READY" | "ERROR" | "BUILDING" | "CANCELED" | "QUEUED";
  url: string;
  createdAt: string;
  durationMs: number;
  branch: string;
}

interface SentryErrorRate {
  type: string;
  count: number;
  trend: "up" | "down" | "stable";
}

interface CheckoutFunnel {
  step: string;
  sessions: number;
  dropoff: number;
}

interface CronHealthRow {
  jobName: string;
  lastStatus: string;
  lastDurationMs: number;
  successRate24h: number;
  failureCount24h: number;
  lastRun: string | null;
}

interface SloSources {
  vercel: SloSourceStatus;
  sentry: SloSourceStatus;
  posthog: SloSourceStatus;
}

interface SloData {
  deploy: DeployStatus | null;
  sentryErrors: SentryErrorRate[];
  checkoutFunnel: CheckoutFunnel[];
  cronHealth: CronHealthRow[];
  loadedAt: string;
}

const EMPTY_DATA: SloData = {
  deploy: null,
  sentryErrors: [],
  checkoutFunnel: [],
  cronHealth: [],
  loadedAt: "",
};

const SOURCE_HINT: Record<keyof SloSources, string> = {
  vercel: "VERCEL_TOKEN",
  sentry: "SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT",
  posthog: "POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID",
};

// ── Helper components ─────────────────────────────────────────────────────────

/** Badge honesto de estado de fuente: en vivo / sin datos / no configurado / error. */
function SourceBadge({ status }: { status: SloSourceStatus }) {
  const cfg: Record<SloSourceStatus, { label: string; cls: string }> = {
    live: { label: "en vivo", cls: "bg-[var(--data-success-100)] text-[var(--data-success-500)]" },
    empty: { label: "sin datos", cls: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
    not_configured: { label: "no configurado", cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
    error: { label: "error de conexión", cls: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" },
  };
  const { label, cls } = cfg[status];
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded ml-auto ${cls}`}>{label}</span>;
}

/** Estado honesto cuando una fuente no tiene datos en vivo (no configurada o error). */
function SourceEmptyState({ status, envHint }: { status: SloSourceStatus; envHint: string }) {
  const isError = status === "error";
  return (
    <div className="flex items-start gap-3 py-2">
      <Cable className={`w-5 h-5 shrink-0 mt-0.5 ${isError ? "text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]"}`} />
      <div className="text-sm">
        <p className="font-semibold text-[var(--text-secondary)]">
          {isError ? "No se pudo conectar" : status === "empty" ? "Sin datos en la ventana" : "Fuente no configurada"}
        </p>
        <p className="text-[var(--text-tertiary)] mt-0.5">
          {isError
            ? "Revisá que las credenciales sean válidas (no placeholders). "
            : status === "empty"
              ? "La integración conecta pero no hay datos en el período. "
              : "Para ver datos reales, agregá en el env: "}
          {status !== "empty" && <code className="font-mono text-xs bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded">{envHint}</code>}
        </p>
      </div>
    </div>
  );
}

function SloCard({
  title,
  value,
  unit,
  status,
  icon,
  detail,
}: {
  title: string;
  value: string | number;
  unit?: string;
  status: "ok" | "warning" | "error";
  icon: React.ReactNode;
  detail?: string;
}) {
  const colors = {
    ok: "border-[var(--data-success-500)] text-[var(--data-success-500)]",
    warning: "border-[#0d9488] text-[#0d9488]",
    error: "border-[var(--data-error-500)] text-[var(--data-error-500)]",
  };
  const bg = {
    ok: "bg-[color-mix(in_oklch,var(--data-success)_6%,transparent)]",
    warning: "bg-[color-mix(in_oklch,#0d9488_6%,transparent)]",
    error: "bg-[color-mix(in_oklch,var(--data-error)_6%,transparent)]",
  };

  return (
    <div className={`rounded-xl border-2 p-5 ${colors[status]} ${bg[status]}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="opacity-80">{icon}</div>
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{title}</span>
      </div>
      <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)]">
        {value}
        {unit && <span className="text-base font-medium ml-1 text-[var(--text-tertiary)]">{unit}</span>}
      </p>
      {detail && <p className="text-xs text-[var(--text-tertiary)] mt-1">{detail}</p>}
    </div>
  );
}

function TrendBadge({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up")
    return <span className="text-xs font-bold text-[var(--data-error-500)]">subiendo</span>;
  if (trend === "down")
    return <span className="text-xs font-bold text-[var(--data-success-500)]">bajando</span>;
  return <span className="text-xs text-[var(--text-tertiary)]">estable</span>;
}

function DeployBadge({ state }: { state: string }) {
  const cfg = {
    READY: { label: "Exitoso", cls: "bg-[var(--data-success-100)] text-[var(--data-success-500)]" },
    ERROR: { label: "Fallido", cls: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" },
    BUILDING: { label: "En proceso", cls: "bg-[#0d9488] text-[#0d9488]" },
    CANCELED: { label: "Cancelado", cls: "bg-gray-100 text-gray-500" },
  } as Record<string, { label: string; cls: string }>;
  const { label, cls } = cfg[state] ?? { label: state, cls: "bg-gray-100 text-gray-500" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SLODashboardPage() {
  const [data, setData] = useState<SloData>(EMPTY_DATA);
  const [sources, setSources] = useState<SloSources>({
    vercel: "not_configured",
    sentry: "not_configured",
    posthog: "not_configured",
  });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      // Datos REALES en paralelo: overview (Vercel + Sentry + PostHog, server-side
      // con los secrets) + cron-health (DB). Estado honesto por fuente; sin mock.
      const [overviewRes, cronRes] = await Promise.all([
        fetch("/api/superadmin/slo/overview"),
        fetch("/api/superadmin/cron-health"),
      ]);
      const overview = overviewRes.ok ? await overviewRes.json() : null;
      const cron = cronRes.ok ? await cronRes.json() : null;
      setData({
        deploy: overview?.deploy ?? null,
        sentryErrors: overview?.sentryErrors ?? [],
        checkoutFunnel: overview?.checkoutFunnel ?? [],
        cronHealth: cron?.jobs ?? [],
        loadedAt: overview?.loadedAt ?? new Date().toISOString(),
      });
      if (overview?.sources) setSources(overview.sources);
    } catch (err) {
      // Honesto: dejamos los estados vacíos (sin datos), nunca mock.
      console.warn("[SLO] carga falló", String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Keyboard: "R" recarga el dashboard (sin foco en campos)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const inField =
        el?.tagName === "INPUT" ||
        el?.tagName === "TEXTAREA" ||
        el?.tagName === "SELECT" ||
        el?.isContentEditable;
      if (!inField && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        void reload();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [reload]);

  const deployLive = sources.vercel === "live" && data.deploy !== null;
  const sentryLive = sources.sentry === "live";
  const funnelLive = sources.posthog === "live";

  const checkoutRate =
    data.checkoutFunnel.length >= 2
      ? Math.round(
          (data.checkoutFunnel[data.checkoutFunnel.length - 1].sessions /
            data.checkoutFunnel[0].sessions) *
            100,
        )
      : 0;

  const totalSentryErrors = data.sentryErrors.reduce((s, e) => s + e.count, 0);
  const cronFailing = data.cronHealth.filter((c) => c.failureCount24h > 0).length;

  // Fuentes que faltan configurar — alimenta el banner honesto.
  const unconfigured = (Object.keys(sources) as Array<keyof SloSources>).filter(
    (k) => sources[k] === "not_configured",
  );

  return (
    <AdminTabShell
      title="SLO Dashboard"
      description="Vercel deploy status, Sentry error rate y PostHog checkout funnel."
      icon={Activity}
      kicker="Operaciones"
    >
      {/* Banner honesto: qué fuentes faltan conectar. Sin esto NO se muestra
          ningún dato inventado — cada sección dice "no configurado". */}
      {unconfigured.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[color-mix(in_oklch,#0d9488_8%,transparent)] border border-[#0d9488]">
          <AlertTriangle className="w-5 h-5 text-[#0d9488] shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-[#0d9488]">
              {unconfigured.length} fuente{unconfigured.length > 1 ? "s" : ""} sin conectar
            </p>
            <p className="text-[var(--text-secondary)] mt-0.5">
              Estas secciones muestran &ldquo;no configurado&rdquo; en vez de datos inventados. Conectá{" "}
              <span className="font-semibold text-[var(--text-primary)]">
                {unconfigured.map((k) => SOURCE_HINT[k].split(" + ")[0]).join(", ")}
              </span>{" "}
              para activarlas. CronHealth ya carga datos reales de la DB.
            </p>
          </div>
        </div>
      )}

      {/* Header actions */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-tertiary)]">
          Actualizado: {fmtTimeSafe(data.loadedAt, "—")}
        </p>
        <button
          onClick={reload}
          disabled={loading}
          title="Actualizar (R)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* KPI row — Brandon 2026-05-20 v13 audit superadmin responsive:
          antes grid-cols-2 lg:grid-cols-4 saltaba de 2→4 sin breakpoint
          intermedio. En sm (640-1024px) seguía 2 cols con cards estrujadas.
          Ahora 1/2/2/4 cols progresivo. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SloCard
          title="Último deploy"
          value={deployLive ? (data.deploy!.state === "READY" ? "OK" : data.deploy!.state) : "—"}
          unit={deployLive ? `${Math.round((data.deploy!.durationMs ?? 0) / 1000)}s` : undefined}
          status={!deployLive ? "warning" : data.deploy!.state === "READY" ? "ok" : data.deploy!.state === "ERROR" ? "error" : "warning"}
          icon={<Zap className="w-5 h-5" />}
          detail={deployLive ? `rama ${data.deploy!.branch}` : "no configurado"}
        />
        <SloCard
          title="Errores Sentry 24h"
          value={sentryLive ? totalSentryErrors : "—"}
          status={!sentryLive ? "warning" : totalSentryErrors === 0 ? "ok" : totalSentryErrors < 20 ? "warning" : "error"}
          icon={<XCircle className="w-5 h-5" />}
          detail={sentryLive ? "últimas 24 horas" : "no configurado"}
        />
        <SloCard
          title="Checkout completion"
          value={funnelLive ? checkoutRate : "—"}
          unit={funnelLive ? "%" : undefined}
          status={!funnelLive ? "warning" : checkoutRate >= 45 ? "ok" : checkoutRate >= 30 ? "warning" : "error"}
          icon={<ShoppingCart className="w-5 h-5" />}
          detail={funnelLive ? "carrito → confirmación" : "no configurado"}
        />
        <SloCard
          title="Crons fallidos 24h"
          value={cronFailing}
          status={cronFailing === 0 ? "ok" : cronFailing <= 2 ? "warning" : "error"}
          icon={<Clock className="w-5 h-5" />}
          detail={`de ${data.cronHealth.length} monitoreados`}
        />
      </div>

      {/* Deploy status */}
      <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-6">
        <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-[var(--accent)]" />
          Vercel — Deploy reciente
          <SourceBadge status={sources.vercel} />
        </h3>
        {deployLive && data.deploy ? (
          <div className="flex flex-wrap items-center gap-4">
            <DeployBadge state={data.deploy.state} />
            <span className="text-sm font-mono text-[var(--text-tertiary)]">{data.deploy.id}</span>
            <span className="text-sm text-[var(--text-secondary)]">
              Duración: {Math.round(data.deploy.durationMs / 1000)}s
            </span>
            <span className="text-sm text-[var(--text-tertiary)]">
              {fmtDateTimeSafe(data.deploy.createdAt, "—")}
            </span>
            <span className="text-sm text-[var(--text-tertiary)]">rama {data.deploy.branch}</span>
          </div>
        ) : (
          <SourceEmptyState status={sources.vercel} envHint={SOURCE_HINT.vercel} />
        )}
      </div>

      {/* Sentry error rate */}
      <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-6">
        <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-[#0d9488]" />
          Sentry — Error rate últimas 24h
          <SourceBadge status={sources.sentry} />
        </h3>
        {sentryLive ? (
          <div className="space-y-3">
            {data.sentryErrors.map((e) => (
              <div key={e.type} className="flex items-center gap-4">
                <span className="text-sm font-mono text-[var(--text-secondary)] flex-1 truncate">{e.type}</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${e.count === 0 ? "bg-[var(--data-success-500)]" : e.count < 10 ? "bg-[#0d9488]" : "bg-[var(--data-error-500)]"}`}
                      style={{ width: `${Math.min(100, (e.count / 50) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold tabular-nums w-8 text-right text-[var(--text-primary)]">{e.count}</span>
                  <TrendBadge trend={e.trend} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <SourceEmptyState status={sources.sentry} envHint={SOURCE_HINT.sentry} />
        )}
      </div>

      {/* PostHog checkout funnel */}
      <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-6">
        <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
          PostHog — Checkout funnel
          <SourceBadge status={sources.posthog} />
        </h3>
        {funnelLive ? (
          <>
            <div className="space-y-2">
              {data.checkoutFunnel.map((step, i) => {
                const maxSessions = data.checkoutFunnel[0]?.sessions ?? 1;
                const pct = Math.round((step.sessions / maxSessions) * 100);
                return (
                  <div key={step.step} className="flex items-center gap-3">
                    <span className="text-xs text-[var(--text-tertiary)] w-4 tabular-nums">{i + 1}.</span>
                    <span className="text-sm text-[var(--text-secondary)] w-36 truncate">{step.step}</span>
                    <div className="flex-1 h-6 rounded-lg bg-[var(--surface-sunken)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)] opacity-80 transition-all rounded-lg"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold tabular-nums w-12 text-right text-[var(--text-primary)]">
                      {step.sessions.toLocaleString()}
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)] w-16 text-right">
                      {i > 0 ? `-${step.dropoff}%` : "base"}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-sm font-semibold text-[var(--text-secondary)] mt-4">
              Tasa de completación: <span className="text-[var(--accent)]">{checkoutRate}%</span>
            </p>
          </>
        ) : (
          <SourceEmptyState status={sources.posthog} envHint={SOURCE_HINT.posthog} />
        )}
      </div>

      {/* CronHealth table (datos reales) */}
      {data.cronHealth.length > 0 && (
        <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-6">
          <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-[var(--data-success-500)]" />
            Cron Jobs — Estado 24h
            <span className="text-xs bg-[var(--data-success-100)] text-[var(--data-success-500)] px-2 py-0.5 rounded ml-auto">datos reales</span>
          </h3>
          <div className="space-y-2">
            {data.cronHealth.slice(0, 15).map((cron) => (
              <div key={cron.jobName} className="flex items-center gap-3">
                <div className="shrink-0">
                  {cron.lastStatus === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-[var(--data-success-500)]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-[var(--data-error-500)]" />
                  )}
                </div>
                <span className="text-sm font-mono text-[var(--text-secondary)] flex-1 truncate">{cron.jobName}</span>
                <span className="text-xs tabular-nums text-[var(--text-tertiary)] w-16 text-right">{cron.lastDurationMs}ms</span>
                <div className="w-16 text-right">
                  <span className={`text-xs font-bold ${cron.successRate24h >= 0.9 ? "text-[var(--data-success-500)]" : cron.successRate24h >= 0.7 ? "text-[#0d9488]" : "text-[var(--data-error-500)]"}`}>
                    {Math.round(cron.successRate24h * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminTabShell>
  );
}
