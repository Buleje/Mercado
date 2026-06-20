"use client";

/**
 * JobsSLO — SLO de confiabilidad de los crons/jobs (Brandon 2026-06-19). Datos
 * REALES de /api/superadmin/slo/jobs (CronHealthLog, 7d): success rate vs
 * objetivo, error budget consumido, y tabla por job con p95 real, última
 * corrida y detección de stale. Reusa SAKpiCard + useVisiblePolling.
 */

import { useCallback, useEffect, useState } from "react";
import { Timer, RefreshCw, CheckCircle2, AlertTriangle, Clock } from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";

type Job = { jobName: string; runs: number; successes: number; failures: number; successRate: number; avgMs: number | null; p95Ms: number | null; maxMs: number | null; lastRun: string | null; lastStatus: string; stale: boolean };
type Data = {
  targetPct: number; windowDays: number;
  overall: { jobs: number; totalRuns: number; totalFailures: number; successRate: number; budgetConsumedPct: number; budgetRemainingPct: number; breached: boolean; staleJobs: number; failingJobs: number };
  jobs: Job[]; generatedAt: string;
};

const ms = (n: number | null) => (n == null ? "—" : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(2)} s`);
const ago = (iso: string | null) => {
  if (!iso) return "nunca";
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "<1h";
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

export function JobsSLO() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/slo/jobs", { credentials: "include", cache: "no-store" });
      if (res.ok) setD((await res.json()) as Data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useVisiblePolling(() => void load(), 30_000);

  if (loading && !d) return <div className="h-64 animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />;
  if (!d) return null;

  const o = d.overall;
  const sloTone = o.breached ? "bad" : o.successRate >= 99.9 ? "good" : "warn";
  const budgetTone = o.budgetConsumedPct >= 100 ? "bad" : o.budgetConsumedPct >= 75 ? "warn" : "good";

  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]"><Timer className="h-4 w-4" strokeWidth={1.75} aria-hidden /></span>
          <div>
            <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">Confiabilidad de jobs (SLO {d.windowDays}d)</h3>
            <p className="text-xs text-[var(--text-tertiary)]">{o.totalRuns} corridas de {o.jobs} crons · objetivo {d.targetPct}% · medido en vivo</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)]/40"><RefreshCw className="h-3.5 w-3.5" /></button>
      </header>

      <div className="p-4 space-y-4">
        {/* KPIs del SLO + error budget */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <SAKpiCard label="SLO actual" value={`${o.successRate}%`} sub={`objetivo ${d.targetPct}%`} tone={sloTone} />
          <SAKpiCard label="Error budget" value={`${o.budgetRemainingPct}%`} sub="presupuesto restante" tone={budgetTone} />
          <SAKpiCard label="Corridas" value={o.totalRuns} sub={`${o.totalFailures} fallidas`} tone={o.totalFailures > 0 ? "warn" : "default"} />
          <SAKpiCard label="Jobs con fallos" value={o.failingJobs} sub="en la ventana" tone={o.failingJobs > 0 ? "bad" : "good"} />
          <SAKpiCard label="Jobs stale" value={o.staleJobs} sub="sin correr >26h" tone={o.staleJobs > 0 ? "warn" : "good"} />
        </div>

        {/* Barra de error budget */}
        <div>
          <div className="flex items-center justify-between text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
            <span>Presupuesto de fallos consumido</span>
            <span className="tabular-nums">{o.budgetConsumedPct}%</span>
          </div>
          <div className="h-2.5 rounded bg-[var(--surface-sunken)] overflow-hidden">
            <div className={`h-full ${o.budgetConsumedPct >= 100 ? "bg-[var(--data-error-500)]" : o.budgetConsumedPct >= 75 ? "bg-[#0d9488]" : "bg-[var(--data-success-500)]"}`} style={{ width: `${Math.min(100, o.budgetConsumedPct)}%` }} />
          </div>
        </div>

        {/* Tabla por job (peores primero) */}
        <div>
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Por job ({d.jobs.length})</p>
          <div className="border border-[var(--rule-soft)] divide-y divide-[var(--rule-soft)] max-h-[420px] overflow-y-auto">
            {d.jobs.map((j) => (
              <div key={j.jobName} className="flex items-center gap-3 px-3 py-2.5">
                {j.failures > 0 ? <AlertTriangle className="h-4 w-4 text-[var(--data-error-600,#dc2626)] shrink-0" /> : j.stale ? <Clock className="h-4 w-4 text-[#0d9488] shrink-0" /> : <CheckCircle2 className="h-4 w-4 text-[var(--data-success-600,#059669)] shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-bold text-[var(--text-primary)] truncate">{j.jobName}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{j.runs} corridas · última {ago(j.lastRun)}{j.stale && <span className="text-[#0d9488] font-bold"> · stale</span>}</p>
                </div>
                <span className="hidden sm:block w-24 text-right text-xs tabular-nums text-[var(--text-secondary)]">p95 {ms(j.p95Ms)}</span>
                <span className={`w-16 text-right text-sm font-extrabold tabular-nums shrink-0 ${j.successRate >= 99 ? "text-[var(--data-success-600,#059669)]" : j.successRate >= 90 ? "text-[#0d9488]" : "text-[var(--data-error-600,#dc2626)]"}`}>{j.successRate}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
