"use client";

/**
 * Panel de pipeline de vendors para Salud de vendors (Brandon 2026-06-19). Da
 * valor inmediato sin depender del cron RENIEC/SUNAT: solicitudes por estado,
 * pendientes de revisión con antigüedad, vendors elegibles para re-verificación,
 * y un countdown a la próxima corrida. Datos reales de /vendor-health/pipeline.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Inbox, CheckCircle2, XCircle, ShieldCheck, Clock, ArrowRight, RefreshCw } from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";

type Pending = { id: string; businessName: string; ruc: string; contactName: string; submittedAt: string; ageDays: number };
type Pipeline = {
  byStatus: { pending: number; approved: number; rejected: number; info_requested: number };
  total: number; approvedMonitored: number; oldestPendingDays: number; pendingList: Pending[]; nextRunAt: string;
};

function countdown(toIso: string, nowMs: number): string {
  const ms = new Date(toIso).getTime() - nowMs;
  if (ms <= 0) return "ahora";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

export function VendorPipelinePanel() {
  const [data, setData] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => 0); // se setea en cliente para el countdown

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin/vendor-health/pipeline", { credentials: "include", cache: "no-store" });
      if (res.ok) setData((await res.json()) as Pipeline);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Tick del countdown cada 30s.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const nextIn = useMemo(() => (data && now ? countdown(data.nextRunAt, now) : "—"), [data, now]);

  if (loading && !data) return <div className="h-28 animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-base)] mb-5" />;
  if (!data) return null;

  return (
    <section className="mb-5 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-base font-extrabold text-[var(--text-primary)]">Pipeline de vendors</h3>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SAKpiCard icon={Inbox} label="Pendientes" value={String(data.byStatus.pending)} sub={data.oldestPendingDays > 0 ? `la más vieja: ${data.oldestPendingDays}d` : "ninguna esperando"} tone={data.byStatus.pending > 0 ? "warn" : "good"} />
        <SAKpiCard icon={CheckCircle2} label="Aprobadas" value={String(data.byStatus.approved)} sub="vendors activos" tone="good" />
        <SAKpiCard icon={XCircle} label="Rechazadas" value={String(data.byStatus.rejected)} />
        <SAKpiCard icon={ShieldCheck} label="Monitoreados" value={String(data.approvedMonitored)} sub="elegibles RENIEC/SUNAT" />
        <SAKpiCard icon={Clock} label="Próxima corrida" value={nextIn} sub="re-verificación 02:00 UTC" tone="warn" />
      </div>

      {data.pendingList.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Solicitudes pendientes de revisión</p>
            <Link href="/superadmin/vendor-applications" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline">Ver todas <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          <ul className="border border-[var(--rule-soft)] divide-y divide-[var(--rule-soft)]">
            {data.pendingList.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">{p.businessName}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate font-mono">RUC {p.ruc} · {p.contactName}</p>
                </div>
                <span className={`text-xs font-bold tabular-nums shrink-0 ${p.ageDays >= 3 ? "text-[var(--data-error-600,#dc2626)]" : "text-[var(--text-tertiary)]"}`}>{p.ageDays}d esperando</span>
                <Link href="/superadmin/vendor-applications" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline shrink-0">Revisar <ArrowRight className="h-3.5 w-3.5" /></Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
