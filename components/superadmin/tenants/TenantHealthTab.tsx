"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2, HeartPulse, AlertTriangle, CheckCircle2, Clock,
  LogIn, ShoppingBag, Layers, TrendingDown,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

// ─── Tipos (espejan el contrato de /api/superadmin/churn/[tenantSlug]) ──────────
type RiskLevel = "low" | "medium" | "high" | "critical";

interface ScoreRow {
  id: string;
  score: number;
  riskLevel: RiskLevel;
  loginsLast7d: number;
  loginsLast30d: number;
  ordersLast7d: number;
  ordersLast30d: number;
  featuresUsed: number;
  daysSinceLastOrder: number;
  daysSinceLastLogin: number;
  trialDaysLeft: number | null;
  calculatedAt: string;
}

interface SignalRow {
  id: string;
  signalType: string;
  severity: RiskLevel;
  detail: string;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  intervention: string | null;
  createdAt: string;
}

interface ChurnDetail {
  latestScore: ScoreRow | null;
  scoreHistory: ScoreRow[];
  signals: { active: SignalRow[]; resolved: SignalRow[] };
}

// ─── Mapas de presentación ──────────────────────────────────────────────────────
const RISK: Record<RiskLevel, { label: string; text: string; bg: string; bar: string }> = {
  low:      { label: "Saludable",   text: "text-[var(--data-success-600,#059669)]", bg: "bg-[var(--data-success-50,#ecfdf5)] dark:bg-[var(--data-success-500)]/15", bar: "bg-[var(--data-success-500)]" },
  medium:   { label: "Atención",    text: "text-[var(--data-warning-600,#d97706)]", bg: "bg-[var(--data-warning-50,#fffbeb)] dark:bg-[var(--data-warning-500)]/15", bar: "bg-[var(--data-warning-500)]" },
  high:     { label: "Alto riesgo", text: "text-[var(--data-error-500,#ef4444)]",   bg: "bg-[var(--data-error-50,#fef2f2)] dark:bg-[var(--data-error-500)]/15",   bar: "bg-[var(--data-error-500)]" },
  critical: { label: "Crítico",     text: "text-[var(--data-error-600,#dc2626)]",   bg: "bg-[var(--data-error-50,#fef2f2)] dark:bg-[var(--data-error-500)]/20",   bar: "bg-[var(--data-error-600,#dc2626)]" },
};

const SIGNAL_LABEL: Record<string, string> = {
  login_drop: "Caída de logins",
  order_drop: "Caída de pedidos",
  trial_expiring: "Trial por vencer",
  support_unresolved: "Soporte sin resolver",
  plan_downgrade_intent: "Intención de bajar de plan",
};

function fmtDT(d: string) {
  return new Date(d).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ─── Sparkline local (no clona primitivo del DS; render one-off) ─────────────────
function ScoreTrend({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const min = Math.min(...data, 0);
  const max = Math.max(...data, 100);
  const range = max - min || 1;
  const step = 100 / (data.length - 1);
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(28 - ((v - min) / range) * 28).toFixed(1)}`)
    .join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={up ? "stroke-[var(--data-success-500)]" : "stroke-[var(--data-error-500)]"}
      />
    </svg>
  );
}

// ─── Tab principal ───────────────────────────────────────────────────────────────
export function TenantHealthTab({ slug }: { slug: string }) {
  const [data, setData] = useState<ChurnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/superadmin/churn/${slug}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ChurnDetail | null) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug]);

  const trend = useMemo(() => (data?.scoreHistory ?? []).map((s) => s.score), [data]);

  const resolveSignal = async (signalId: string) => {
    setResolving(signalId);
    try {
      const res = await fetch(`/api/superadmin/churn/${slug}`, {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ signalId, resolvedBy: "manual" }),
      });
      if (res.ok) {
        setData((prev) => {
          if (!prev) return prev;
          const sig = prev.signals.active.find((s) => s.id === signalId);
          if (!sig) return prev;
          return {
            ...prev,
            signals: {
              active: prev.signals.active.filter((s) => s.id !== signalId),
              resolved: [{ ...sig, resolved: true, resolvedAt: new Date().toISOString(), resolvedBy: "manual" }, ...prev.signals.resolved],
            },
          };
        });
      }
    } finally {
      setResolving(null);
    }
  };

  if (loading) {
    return <p className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando salud…</p>;
  }

  const score = data?.latestScore;
  if (!score) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <HeartPulse className="h-8 w-8 text-[var(--text-tertiary)]" />
        <p className="text-sm font-semibold text-[var(--text-secondary)]">Aún sin health score</p>
        <p className="max-w-xs text-xs text-[var(--text-tertiary)]">El cron anti-churn todavía no calculó la salud de este negocio. Aparecerá tras la próxima corrida.</p>
      </div>
    );
  }

  const risk = RISK[score.riskLevel];
  const active = data?.signals.active ?? [];
  const resolved = data?.signals.resolved ?? [];

  const drivers: { icon: typeof LogIn; label: string; value: string; warn: boolean }[] = [
    { icon: LogIn, label: "Logins 7d / 30d", value: `${score.loginsLast7d} / ${score.loginsLast30d}`, warn: score.loginsLast7d === 0 },
    { icon: ShoppingBag, label: "Pedidos 7d / 30d", value: `${score.ordersLast7d} / ${score.ordersLast30d}`, warn: score.ordersLast7d === 0 },
    { icon: Clock, label: "Días sin login", value: `${score.daysSinceLastLogin}`, warn: score.daysSinceLastLogin >= 7 },
    { icon: TrendingDown, label: "Días sin vender", value: `${score.daysSinceLastOrder}`, warn: score.daysSinceLastOrder >= 7 },
    { icon: Layers, label: "Funciones usadas", value: `${score.featuresUsed} / 47`, warn: score.featuresUsed <= 3 },
    { icon: Clock, label: "Trial restante", value: score.trialDaysLeft !== null ? `${score.trialDaysLeft} días` : "—", warn: score.trialDaysLeft !== null && score.trialDaysLeft <= 3 },
  ];

  return (
    <div className="space-y-5">
      {/* Score gauge + riesgo + tendencia */}
      <div className={`rounded-xl border border-[var(--rule-base)] p-4 ${risk.bg}`}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Health score</p>
            <div className="flex items-baseline gap-2">
              <span className={`text-4xl font-extrabold tabular-nums ${risk.text}`}>{score.score}</span>
              <span className="text-sm text-[var(--text-tertiary)]">/ 100</span>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${risk.text} bg-[var(--surface-raised)]`}>
            <HeartPulse className="h-4 w-4" /> {risk.label}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
          <div className={`h-full rounded-full ${risk.bar}`} style={{ width: `${Math.max(2, Math.min(100, score.score))}%` }} />
        </div>
        {trend.length >= 2 && (
          <div className="mt-3">
            <p className="mb-1 text-xs text-[var(--text-tertiary)]">Tendencia (últimos {trend.length} cálculos)</p>
            <ScoreTrend data={trend} />
          </div>
        )}
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">Calculado {fmtDT(score.calculatedAt)}</p>
      </div>

      {/* Drivers */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--text-tertiary)]">Qué mueve el score</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {drivers.map(({ icon: Icon, label, value, warn }) => (
            <div key={label} className="rounded-xl bg-[var(--surface-sunken)]/50 p-3">
              <p className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]"><Icon className="h-3.5 w-3.5" /> {label}</p>
              <p className={`mt-1 text-base font-bold tabular-nums ${warn ? "text-[var(--data-error-500)]" : "text-[var(--text-primary)]"}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Señales activas */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--text-tertiary)]">
          <AlertTriangle className="h-4 w-4" /> Señales activas {active.length > 0 && <span className="rounded-full bg-[var(--data-error-500)] px-1.5 text-xs font-bold text-white">{active.length}</span>}
        </h3>
        {active.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-[var(--surface-sunken)]/40 px-3 py-2.5 text-sm text-[var(--text-secondary)]"><CheckCircle2 className="h-4 w-4 text-[var(--data-success-500)]" /> Sin señales activas — todo en orden.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((s) => (
              <li key={s.id} className="flex items-start gap-3 rounded-xl border border-[var(--rule-base)] px-3 py-2.5">
                <span className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${RISK[s.severity]?.bar ?? "bg-[var(--data-warning-500)]"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--text-primary)]">{SIGNAL_LABEL[s.signalType] ?? s.signalType}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{s.detail}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{fmtDT(s.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void resolveSignal(s.id)}
                  disabled={resolving === s.id}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
                >
                  {resolving === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Resolver
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Señales resueltas (últimos 30 días) */}
      {resolved.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--text-tertiary)]">Resueltas recientemente</h3>
          <ul className="space-y-1.5">
            {resolved.slice(0, 8).map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-lg bg-[var(--surface-sunken)]/30 px-3 py-2 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-500)]" />
                <span className="font-semibold text-[var(--text-secondary)]">{SIGNAL_LABEL[s.signalType] ?? s.signalType}</span>
                <span className="ml-auto text-[var(--text-tertiary)]">{s.resolvedBy ?? "—"}{s.resolvedAt ? ` · ${fmtDT(s.resolvedAt)}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
