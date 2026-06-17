"use client";

/**
 * /superadmin/alerts — Centro de alertas cross-tenant (Brandon 2026-06-14).
 * Feed único de lo que necesita atención YA, con acción directa a cada item.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, RefreshCw, AlertTriangle, Clock, Inbox, Rocket, UserPlus, ArrowRight, CheckCircle2 } from "@buleje/design-system/icons";
import { AdminTabShell } from "../_components/_shared";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";

type Severity = "critical" | "warning" | "info";
type Alert = { id: string; severity: Severity; kind: string; title: string; detail: string; href: string; at: string | null };
type Counts = { critical: number; warning: number; info: number; total: number };

const KIND_ICON: Record<string, typeof Bell> = {
  ticket: Inbox, trial: Clock, sla: Clock, stale: Rocket, new: UserPlus,
};
const SEV_STYLE: Record<Severity, { dot: string; chip: string }> = {
  critical: { dot: "bg-[var(--data-error-500)]", chip: "text-[var(--data-error-600,#dc2626)]" },
  warning: { dot: "bg-teal-500", chip: "text-[#0d9488]" },
  info: { dot: "bg-[var(--accent)]", chip: "text-[var(--accent)]" },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSuperadmin("/api/superadmin/alerts");
      if (res.ok) {
        const d = (await res.json()) as { alerts: Alert[]; counts: Counts };
        setAlerts(d.alerts ?? []);
        setCounts(d.counts ?? null);
      }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <AdminTabShell
      title="Centro de alertas"
      kicker="Plataforma · Operaciones"
      description="Lo que necesita tu atención ahora, en todas las tiendas."
      icon={Bell}
      actions={
        <button onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      }
    >
      {counts && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Críticas</p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-[var(--data-error-600,#dc2626)]">{counts.critical}</p>
          </div>
          <div className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Advertencias</p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-[#0d9488]">{counts.warning}</p>
          </div>
          <div className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Informativas</p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-[var(--accent)]">{counts.info}</p>
          </div>
        </div>
      )}

      {loading && alerts.length === 0 ? (
        <div className="space-y-2">{[0,1,2,3].map((i) => <div key={i} className="h-16 animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-soft)]" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="border-2 border-dashed border-[var(--rule-base)] p-12 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto text-[var(--data-success-500)] mb-3" />
          <p className="text-base font-bold text-[var(--text-primary)]">Todo en orden</p>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">No hay alertas que requieran tu atención.</p>
        </div>
      ) : (
        <div className="border border-[var(--rule-base)] divide-y divide-[var(--rule-base)]">
          {alerts.map((a) => {
            const Icon = KIND_ICON[a.kind] ?? Bell;
            const sev = SEV_STYLE[a.severity];
            return (
              <Link key={a.id} href={a.href} className="group flex items-center gap-3 px-3 py-3 hover:bg-[var(--surface-sunken)] transition-colors">
                <span className={`h-2 w-2 rounded-full shrink-0 ${sev.dot}`} />
                <Icon className={`h-4 w-4 shrink-0 ${sev.chip}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">{a.title}</p>
                  <p className="text-xs text-[var(--text-tertiary)] truncate">{a.detail}</p>
                </div>
                {a.at && <span className="text-xs text-[var(--text-tertiary)] tabular-nums shrink-0">{timeAgo(a.at)}</span>}
                <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </AdminTabShell>
  );
}
