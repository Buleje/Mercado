"use client";

/**
 * SLO Dashboard — Vercel + Sentry + PostHog combinados
 *
 * TODO (Brandon): Para conectar datos reales de produccion:
 *   1. VERCEL_TOKEN + VERCEL_TEAM_ID → habilitar seccion "Deploy Status"
 *      API: https://api.vercel.com/v6/deployments?teamId=...&limit=5
 *   2. SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT → seccion "Error Rate"
 *      API: https://sentry.io/api/0/organizations/{org}/stats_v2/?field=sum(session.errored)
 *   3. PostHog ya esta conectado via MCP — checkout funnel se puede activar
 *      cambiando POSTHOG_FUNNEL_MOCK=false y configurando el insight ID correcto
 *      en lib/slo/posthog-funnel.ts (aun pendiente de crear)
 *   4. CronHealth: ya funciona — lee de /api/superadmin/cron-health (existente)
 */

import { useState, useEffect, useCallback } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw,
  ShoppingCart, TrendingUp, XCircle, Zap, BarChart3,
} from "@buleje/design-system/icons";
import { AdminTabShell } from "../_components/_shared";
import { fmtTimeSafe, fmtDateTimeSafe } from "@/lib/superadmin/safe-helpers";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeployStatus {
  id: string;
  state: "READY" | "ERROR" | "BUILDING" | "CANCELED";
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

interface SloData {
  deploy: DeployStatus | null;
  sentryErrors: SentryErrorRate[];
  checkoutFunnel: CheckoutFunnel[];
  cronHealth: CronHealthRow[];
  loadedAt: string;
}

// ── Mock data (reemplazar con APIs reales — ver TODO arriba) ──────────────────

const MOCK_DATA: SloData = {
  loadedAt: new Date().toISOString(),
  deploy: {
    id: "dpl_mock_001",
    state: "READY",
    url: "https://buleje.vercel.app",
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    durationMs: 68_000,
    branch: "main",
  },
  sentryErrors: [
    { type: "TypeError", count: 12, trend: "down" },
    { type: "PrismaClientKnownRequestError", count: 3, trend: "stable" },
    { type: "ZodError (safeParse missed)", count: 0, trend: "stable" },
    { type: "AuthError (401)", count: 47, trend: "up" },
  ],
  checkoutFunnel: [
    { step: "Ver carrito", sessions: 1240, dropoff: 0 },
    { step: "Iniciar checkout", sessions: 890, dropoff: 28 },
    { step: "Datos de entrega", sessions: 720, dropoff: 19 },
    { step: "Metodo de pago", sessions: 640, dropoff: 11 },
    { step: "Confirmacion", sessions: 580, dropoff: 9 },
  ],
  cronHealth: [],
};

// ── Helper components ─────────────────────────────────────────────────────────

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
    warning: "border-[var(--data-warning-500)] text-[var(--data-warning-500)]",
    error: "border-[var(--data-error-500)] text-[var(--data-error-500)]",
  };
  const bg = {
    ok: "bg-[color-mix(in_oklch,var(--data-success)_6%,transparent)]",
    warning: "bg-[color-mix(in_oklch,var(--data-warning)_6%,transparent)]",
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
    BUILDING: { label: "En proceso", cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" },
    CANCELED: { label: "Cancelado", cls: "bg-gray-100 text-gray-500" },
  } as Record<string, { label: string; cls: string }>;
  const { label, cls } = cfg[state] ?? { label: state, cls: "bg-gray-100 text-gray-500" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SLODashboardPage() {
  const [data, setData] = useState<SloData>(MOCK_DATA);
  const [loading, setLoading] = useState(false);
  // Brandon 2026-05-21 audit fix #10: ocultar mock banner en producción.
  // Antes siempre `true` → banner amarillo "Datos de ejemplo activos"
  // visible incluso al cliente final del deploy. Ahora: solo si NEXT_PUBLIC
  // env flag explícita (default false en cualquier deploy).
  const [usingMock, _setUsingMock] = useState(
    process.env.NEXT_PUBLIC_SLO_DASHBOARD_MOCKS === "1",
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      // Intentar datos reales de CronHealth (ya funciona en prod)
      const res = await fetch("/api/superadmin/cron-health");
      if (res.ok) {
        const cronData = await res.json();
        setData((prev) => ({
          ...prev,
          cronHealth: cronData.jobs ?? [],
          loadedAt: new Date().toISOString(),
        }));
      }

      // TODO: Desactivar usingMock cuando se integren Vercel + Sentry APIs
      // setUsingMock(false);
    } catch {
      // Silencioso — mantener mock
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

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

  return (
    <AdminTabShell
      title="SLO Dashboard"
      description="Vercel deploy status, Sentry error rate y PostHog checkout funnel."
      icon={Activity}
      kicker="Operaciones"
    >
      {/* Mock warning banner */}
      {usingMock && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[color-mix(in_oklch,var(--data-warning)_8%,transparent)] border border-[var(--data-warning-500)]">
          <AlertTriangle className="w-5 h-5 text-[var(--data-warning-500)] shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-[var(--data-warning-500)]">Datos de ejemplo activos</p>
            <p className="text-[var(--text-secondary)] mt-0.5">
              Vercel y Sentry muestran datos mock. CronHealth carga datos reales de produccion.
              Ver TODO comments en este archivo para activar APIs reales.
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
          title="Ultimo deploy"
          value={data.deploy?.state === "READY" ? "OK" : data.deploy?.state ?? "—"}
          unit={data.deploy ? `${Math.round((data.deploy.durationMs ?? 0) / 1000)}s` : undefined}
          status={data.deploy?.state === "READY" ? "ok" : data.deploy?.state === "ERROR" ? "error" : "warning"}
          icon={<Zap className="w-5 h-5" />}
          detail={data.deploy ? `rama ${data.deploy.branch}` : undefined}
        />
        <SloCard
          title="Errores Sentry 24h"
          value={totalSentryErrors}
          status={totalSentryErrors === 0 ? "ok" : totalSentryErrors < 20 ? "warning" : "error"}
          icon={<XCircle className="w-5 h-5" />}
          detail="ultimas 24 horas"
        />
        <SloCard
          title="Checkout completion"
          value={checkoutRate}
          unit="%"
          status={checkoutRate >= 45 ? "ok" : checkoutRate >= 30 ? "warning" : "error"}
          icon={<ShoppingCart className="w-5 h-5" />}
          detail="carrito → confirmacion"
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
        </h3>
        {data.deploy ? (
          <div className="flex items-center gap-4">
            <DeployBadge state={data.deploy.state} />
            <span className="text-sm font-mono text-[var(--text-tertiary)]">{data.deploy.id}</span>
            <span className="text-sm text-[var(--text-secondary)]">
              Duracion: {Math.round(data.deploy.durationMs / 1000)}s
            </span>
            <span className="text-sm text-[var(--text-tertiary)]">
              {fmtDateTimeSafe(data.deploy.createdAt, "—")}
            </span>
            {/* TODO: Reemplazar con datos de API Vercel — ver CLAUDE.md env VERCEL_TOKEN */}
            <span className="text-xs bg-[var(--surface-sunken)] px-2 py-0.5 rounded text-[var(--text-tertiary)]">mock</span>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-tertiary)]">Sin datos de deploy</p>
        )}
      </div>

      {/* Sentry error rate */}
      <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-6">
        <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-[var(--data-warning-500)]" />
          Sentry — Error rate ultimas 24h
          {/* TODO: Conectar con SENTRY_AUTH_TOKEN + org/project en .env — ver TODO header */}
          <span className="text-xs bg-[var(--surface-sunken)] px-2 py-0.5 rounded text-[var(--text-tertiary)] ml-auto">mock</span>
        </h3>
        <div className="space-y-3">
          {data.sentryErrors.map((e) => (
            <div key={e.type} className="flex items-center gap-4">
              <span className="text-sm font-mono text-[var(--text-secondary)] flex-1 truncate">{e.type}</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${e.count === 0 ? "bg-[var(--data-success-500)]" : e.count < 10 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]"}`}
                    style={{ width: `${Math.min(100, (e.count / 50) * 100)}%` }}
                  />
                </div>
                <span className="text-sm font-bold tabular-nums w-8 text-right text-[var(--text-primary)]">{e.count}</span>
                <TrendBadge trend={e.trend} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PostHog checkout funnel */}
      <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-6">
        <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
          PostHog — Checkout funnel
          {/* TODO: Conectar PostHog MCP (ya disponible) con insight ID del funnel de checkout */}
          <span className="text-xs bg-[var(--surface-sunken)] px-2 py-0.5 rounded text-[var(--text-tertiary)] ml-auto">mock</span>
        </h3>
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
          Tasa de completacion: <span className="text-[var(--accent)]">{checkoutRate}%</span>
        </p>
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
                  <span className={`text-xs font-bold ${cron.successRate24h >= 0.9 ? "text-[var(--data-success-500)]" : cron.successRate24h >= 0.7 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]"}`}>
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
