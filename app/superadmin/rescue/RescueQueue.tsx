"use client";

/**
 * RescueQueue — cola de rescate (Brandon 2026-06-19, idea #3). Negocios a punto
 * de irse, rankeados por urgencia × valor, con la razón del riesgo y acciones:
 * Contactar, Impersonar, Ficha 360 y Extender trial. Datos reales de
 * /api/superadmin/rescue. Reusa SAKpiCard + useVisiblePolling.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  HeartHandshake, AlertTriangle, Clock, Wallet, RefreshCw, LogIn, MessageSquare,
  ExternalLink, CalendarClock, Store,
} from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import SuperadminChartCard from "@/components/superadmin/_shared/SuperadminChartCard";
import { AdminTabShell } from "../_components/_shared";
import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";
import { csrfHeaders } from "@/lib/csrf-client";

const RESCUE_INFO = {
  title: "Cola de rescate",
  what: "Junta los negocios a punto de irse y los ordena por urgencia × valor (riesgo, días sin vender/entrar, trial por vencer, plan). Actuás primero sobre el de arriba.",
  affects: "Solo el superadmin. Acciones de retención: contactar, impersonar, ver ficha 360 y extender trial (esto último SÍ escribe en la DB).",
  example: "Una pollería enterprise lleva 49 días sin vender y está crítica → la ves arriba de la cola y la contactás o le extendés el trial antes de perderla.",
} as const;

type Row = { id: string; name: string; slug: string; plan: string; active: boolean; score: number | null; riskLevel: string; daysSinceLastOrder: number; daysSinceLastLogin: number; trialDaysLeft: number | null; loginsLast7d: number; ordersLast7d: number; reasons: string[]; priority: number };
type Kpis = { critical: number; high: number; trialsExpiring: number; paidAtRisk: number; total: number };
type Data = { queue: Row[]; kpis: Kpis };

const RISK: Record<string, string> = {
  critical: "bg-[var(--data-error-600,#dc2626)] text-white",
  high: "bg-[var(--data-error-500)]/10 text-[var(--data-error-600,#dc2626)]",
  medium: "bg-[#0d9488]/10 text-[#0d9488]",
  low: "bg-[var(--data-success-500)]/10 text-[var(--data-success-600,#059669)]",
};

export function RescueQueue() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [riskFilter, setRiskFilter] = useState<"all" | "critical" | "high" | "paid" | "trial">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/superadmin/rescue", { credentials: "include", cache: "no-store" });
      if (res.ok) setD((await res.json()) as Data);
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useVisiblePolling(() => void load(true), 30_000);

  const impersonate = useCallback(async (slug: string) => {
    setBusy(slug);
    try {
      const res = await fetch("/api/superadmin/impersonate", { method: "POST", credentials: "include", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ slug }) });
      if (res.ok) window.open(`/t/${encodeURIComponent(slug)}/admin`, "_blank");
    } finally { setBusy(null); }
  }, []);

  const extendTrial = useCallback(async (slug: string, name: string) => {
    if (!window.confirm(`¿Extender el trial de "${name}" 7 días más?`)) return;
    setBusy(slug);
    try {
      const res = await fetch("/api/superadmin/rescue", { method: "POST", credentials: "include", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ action: "extend-trial", slug, days: 7 }) });
      const r = await res.json().catch(() => ({}));
      setToast(r.ok ? "Trial extendido 7 días ✓" : "No se pudo extender");
      await load(true);
    } catch { setToast("Error al extender"); } finally { setBusy(null); setTimeout(() => setToast(null), 4000); }
  }, [load]);

  const filtered = useMemo(() => {
    if (!d) return [];
    if (riskFilter === "all") return d.queue;
    if (riskFilter === "paid") return d.queue.filter((r) => r.plan !== "free");
    if (riskFilter === "trial") return d.queue.filter((r) => r.trialDaysLeft != null && r.trialDaysLeft <= 7);
    return d.queue.filter((r) => r.riskLevel === riskFilter);
  }, [d, riskFilter]);

  const refreshBtn = (
    <button
      type="button"
      onClick={() => void load()}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)]/40"
      title="Actualizar"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Actualizar
    </button>
  );

  if (loading && !d) {
    return (
      <AdminTabShell title="Cola de rescate" description="Atajá al que se va a ir antes de que pase. Priorizado por urgencia y valor." icon={HeartHandshake} kicker="Plataforma · Retención" info={RESCUE_INFO}>
        <div className="h-64 animate-pulse rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]" />
      </AdminTabShell>
    );
  }
  if (!d) return null;
  const k = d.kpis;

  const chip = (key: typeof riskFilter, label: string, n: number) => (
    <button type="button" onClick={() => setRiskFilter(key)} className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${riskFilter === key ? "bg-[var(--accent)] text-white" : "border border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40"}`}>{label} <span className="tabular-nums opacity-70">{n}</span></button>
  );

  return (
    <AdminTabShell
      title="Cola de rescate"
      description="Atajá al que se va a ir antes de que pase. Priorizado por urgencia y valor."
      icon={HeartHandshake}
      kicker="Plataforma · Retención"
      info={RESCUE_INFO}
      actions={refreshBtn}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SAKpiCard icon={AlertTriangle} label="Crítico" value={k.critical} sub="se van ya" tone={k.critical > 0 ? "bad" : "good"} />
        <SAKpiCard icon={HeartHandshake} label="En riesgo alto" value={k.high} tone={k.high > 0 ? "warn" : "good"} />
        <SAKpiCard icon={Wallet} label="Pagados en riesgo" value={k.paidAtRisk} sub="MRR que peligra" tone={k.paidAtRisk > 0 ? "bad" : "good"} />
        <SAKpiCard icon={Clock} label="Trials por vencer" value={k.trialsExpiring} sub="≤7 días" tone={k.trialsExpiring > 0 ? "warn" : "default"} />
        <SAKpiCard icon={Store} label="En la cola" value={k.total} sub="negocios a rescatar" />
      </div>

      <SuperadminChartCard
        kicker="Prioridad"
        title="Negocios a rescatar"
        description="Priorizada por urgencia × valor · actuá primero sobre el de arriba · auto 30s"
        density="compact"
        actions={toast ? <span className="text-xs font-bold text-[var(--accent)]">{toast}</span> : undefined}
      >
        <div className="space-y-3">
          {k.total === 0 ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 px-3.5 py-3">
              <HeartHandshake className="h-5 w-5 text-[var(--data-success-600,#059669)] shrink-0" />
              <p className="text-sm font-bold text-[var(--text-primary)]">Ningún negocio en riesgo — todos saludables.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {chip("all", "Todos", k.total)}
                {chip("critical", "Crítico", k.critical)}
                {chip("high", "Alto", k.high)}
                {chip("paid", "Pagados", k.paidAtRisk)}
                {chip("trial", "Trials", k.trialsExpiring)}
              </div>

              <ul className="border border-[var(--rule-soft)] divide-y divide-[var(--rule-soft)]">
                {filtered.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-3">
                    <span className="w-6 shrink-0 text-center font-display text-sm font-extrabold tabular-nums text-[var(--text-tertiary)]">{riskFilter === "all" ? i + 1 : "·"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/superadmin/tenants/${encodeURIComponent(r.slug)}`} className="inline-flex items-center gap-1 text-sm font-extrabold text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline"><Store className="h-3.5 w-3.5 text-[var(--accent)]" /> {r.name}</Link>
                        <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">{r.plan}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${RISK[r.riskLevel] ?? RISK.medium}`}>{r.riskLevel}</span>
                        {r.score != null && <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">health {r.score}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {r.reasons.map((rs) => (
                          <span key={rs} className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">{rs}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {r.trialDaysLeft != null && (
                        <button type="button" disabled={busy === r.slug} onClick={() => void extendTrial(r.slug, r.name)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50" title="Extender trial 7 días"><CalendarClock className="h-3.5 w-3.5" /> +7d</button>
                      )}
                      <button type="button" disabled={busy === r.slug} onClick={() => void impersonate(r.slug)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50" title="Entrar al panel"><LogIn className="h-3.5 w-3.5" /></button>
                      <Link href={`/superadmin/chat?tenant=${encodeURIComponent(r.slug)}&msg=${encodeURIComponent(`Hola, te escribo del equipo Buleje para ver cómo va ${r.name} y darte una mano.`)}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Contactar"><MessageSquare className="h-3.5 w-3.5" /></Link>
                      <Link href={`/superadmin/tenants/${encodeURIComponent(r.slug)}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 text-xs font-bold text-white hover:brightness-110" title="Ficha 360">Ficha <ExternalLink className="h-3.5 w-3.5" /></Link>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </SuperadminChartCard>
    </AdminTabShell>
  );
}
