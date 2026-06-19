"use client";

/**
 * /superadmin/alerts — Centro de alertas cross-tenant.
 * Feed de lo que necesita atención YA, con acción directa a cada item.
 *
 * v2 (Brandon 2026-06-19): tabs por severidad + filtro por tipo + búsqueda por
 * tienda + auto-refresh en vivo. Tipos nuevos: pagos Yape por aprobar (#8) y
 * riesgo de churn (#9). Datos reales vía /api/superadmin/alerts.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell, RefreshCw, Clock, Inbox, Rocket, UserPlus, ArrowRight, CheckCircle2,
  Smartphone, TrendingDown, Search, X, AlertTriangle,
} from "@buleje/design-system/icons";
import { AdminTabShell } from "../_components/_shared";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";

type Severity = "critical" | "warning" | "info";
type Alert = { id: string; severity: Severity; kind: string; title: string; detail: string; href: string; at: string | null; tenant?: string };
type Counts = { critical: number; warning: number; info: number; total: number };

const KIND_ICON: Record<string, typeof Bell> = {
  ticket: Inbox, trial: Clock, sla: Clock, stale: Rocket, new: UserPlus,
  payment: Smartphone, churn: TrendingDown,
};
const KIND_LABEL: Record<string, string> = {
  ticket: "Tickets", trial: "Trials", sla: "SLA pedidos", stale: "Dormidas",
  new: "Nuevas", payment: "Pagos Yape", churn: "Churn",
};
const SEV_STYLE: Record<Severity, { dot: string; chip: string }> = {
  critical: { dot: "bg-[var(--data-error-500)]", chip: "text-[var(--data-error-600,#dc2626)]" },
  warning: { dot: "bg-teal-500", chip: "text-[#0d9488]" },
  info: { dot: "bg-[var(--accent)]", chip: "text-[var(--accent)]" },
};

const TABS: { id: "all" | Severity; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "critical", label: "Críticas" },
  { id: "warning", label: "Advertencias" },
  { id: "info", label: "Info" },
];

const REFRESH_MS = 45_000;

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
  const [lastAt, setLastAt] = useState<string | null>(null);

  const [tab, setTab] = useState<"all" | Severity>("all");
  const [kind, setKind] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSuperadmin("/api/superadmin/alerts");
      if (res.ok) {
        const d = (await res.json()) as { alerts: Alert[]; counts: Counts };
        setAlerts(d.alerts ?? []);
        setCounts(d.counts ?? null);
        setLastAt(new Date().toISOString());
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh en vivo (#14): cada 45s, salvo que la pestaña esté en background.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Tipos presentes en el feed actual (para las chips de filtro).
  const kindsPresent = useMemo(() => {
    const set = new Set(alerts.map((a) => a.kind));
    return Array.from(set);
  }, [alerts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return alerts.filter((a) => {
      if (tab !== "all" && a.severity !== tab) return false;
      if (kind && a.kind !== kind) return false;
      if (q && !`${a.title} ${a.detail} ${a.tenant ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [alerts, tab, kind, query]);

  const countFor = (id: "all" | Severity) =>
    id === "all" ? counts?.total ?? 0 : counts?.[id] ?? 0;

  return (
    <AdminTabShell
      title="Centro de alertas"
      kicker="Plataforma · Operaciones"
      description="Lo que necesita tu atención ahora, en todas las tiendas."
      icon={Bell}
      actions={
        <div className="flex items-center gap-2">
          {lastAt && (
            <span className="hidden sm:inline text-xs text-[var(--text-tertiary)] tabular-nums">
              Actualizado {timeAgo(lastAt)} · auto cada 45s
            </span>
          )}
          <button onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </button>
        </div>
      }
    >
      {/* Tabs por severidad (#5) — doblan como contador clickeable */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => {
          const active = tab === t.id;
          const n = countFor(t.id);
          const accent =
            t.id === "critical" ? "text-[var(--data-error-600,#dc2626)]" :
            t.id === "warning" ? "text-[#0d9488]" :
            t.id === "info" ? "text-[var(--accent)]" : "text-[var(--text-primary)]";
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={active}
              className={[
                "inline-flex items-center gap-2 rounded-xl border-2 px-3.5 h-11 text-sm font-bold transition-colors",
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40",
              ].join(" ")}
            >
              {t.label}
              <span className={`tabular-nums font-extrabold ${active ? accent : "text-[var(--text-tertiary)]"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Búsqueda por tienda/texto (#6) + chips de tipo */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por tienda, título o detalle…"
            className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-10 pr-9 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Limpiar" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {kindsPresent.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setKind(null)} className={["rounded-lg px-2.5 h-9 text-xs font-bold transition-colors", kind === null ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"].join(" ")}>Todos</button>
            {kindsPresent.map((k) => (
              <button key={k} type="button" onClick={() => setKind(kind === k ? null : k)} className={["rounded-lg px-2.5 h-9 text-xs font-bold transition-colors", kind === k ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"].join(" ")}>
                {KIND_LABEL[k] ?? k}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && alerts.length === 0 ? (
        <div className="space-y-2">{[0,1,2,3].map((i) => <div key={i} className="h-16 animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-soft)]" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="border-2 border-dashed border-[var(--rule-base)] p-12 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto text-[var(--data-success-500)] mb-3" />
          <p className="text-base font-bold text-[var(--text-primary)]">Todo en orden</p>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">No hay alertas que requieran tu atención.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed border-[var(--rule-base)] p-10 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-[var(--text-tertiary)] mb-2" />
          <p className="text-sm font-bold text-[var(--text-primary)]">Sin alertas con estos filtros</p>
          <button type="button" onClick={() => { setTab("all"); setKind(null); setQuery(""); }} className="mt-2 text-sm font-bold text-[var(--accent)] hover:underline">Limpiar filtros</button>
        </div>
      ) : (
        <>
          <p className="text-xs text-[var(--text-tertiary)] mb-2 tabular-nums">{filtered.length} de {alerts.length}</p>
          <div className="border border-[var(--rule-base)] divide-y divide-[var(--rule-base)]">
            {filtered.map((a) => {
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
        </>
      )}
    </AdminTabShell>
  );
}
