"use client";

/**
 * /superadmin/tenants/onboarding — Activación de tiendas (gestión de tiendas).
 * Hitos de setup por tienda + reactivación de las estancadas (clave para
 * convertir trials).
 *
 * v2 (Brandon 2026-06-19): embudo de activación, KPIs extra, cohortes por
 * antigüedad, búsqueda/filtros/orden, resaltar viejas, reactivar con mensaje
 * contextual, impersonar, CSV, auto-refresh, drawer de detalle, doble riesgo
 * (estancada + trial venciendo). Datos reales del endpoint.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Rocket, ArrowLeft, RefreshCw, Check, MessageSquare, Image, Package,
  ShoppingBag, Banknote, Search, X, Download, ExternalLink, Clock,
} from "@buleje/design-system/icons";
import { AdminTabShell } from "../../_components/_shared";
import { SuperAdminModuleTabs, TENANTS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { csrfHeaders } from "@/lib/csrf-client";

type Step = "logo" | "productos" | "pedido" | "venta";
type Row = {
  slug: string; name: string; plan: string; createdAt: string;
  trialEndsAt: string | null; trialDaysLeft: number | null; ageDays: number;
  steps: Record<Step, boolean>; done: number; total: number; pct: number;
  stuckAt: Step | null; complete: boolean;
  contactStatus: "none" | "contacted" | "snoozed"; snoozedUntil: string | null;
};
type Summary = { total: number; complete: number; stuck: number };
type StatusFilter = "all" | "complete" | "stuck" | `stuck:${Step}`;
type SortKey = "progress" | "age" | "name";

const STEP_META: Record<Step, { label: string; icon: typeof Image }> = {
  logo: { label: "Logo", icon: Image },
  productos: { label: "Productos", icon: Package },
  pedido: { label: "1er pedido", icon: ShoppingBag },
  venta: { label: "1ra venta POS", icon: Banknote },
};
const STEPS: Step[] = ["logo", "productos", "pedido", "venta"];
const OLD_DAYS = 14; // estancada "vieja" → prioridad

function reactivateMsg(name: string, step: Step | null): string {
  const m: Record<Step, string> = {
    logo: `¡Hola! Vi que ${name} todavía no subió su logo. Te ayudo a ponerlo en Configuración → Tienda para que se vea profesional. ¿Lo hacemos?`,
    productos: `${name} aún no cargó productos. Subamos los primeros juntos para que puedas empezar a vender — ¿te doy una mano?`,
    pedido: `${name} ya tiene productos pero aún no recibió su primer pedido. ¿Activamos el delivery/marketplace para que lleguen las ventas?`,
    venta: `¡Casi listos! A ${name} le falta su primera venta en el POS. ¿Hacemos una prueba juntos ahora?`,
  };
  return step ? m[step] : `¡Felicitaciones! ${name} ya completó toda su activación.`;
}

function exportCSV(rows: Row[]) {
  const head = ["Tienda", "Slug", "Plan", "Progreso", "Estancada en", "Días desde alta", "Trial días", "Logo", "Productos", "1er pedido", "1ra venta"];
  const lines = rows.map((r) => [
    r.name, r.slug, r.plan, `${r.done}/${r.total}`, r.stuckAt ? STEP_META[r.stuckAt].label : "—",
    r.ageDays, r.trialDaysLeft ?? "", r.steps.logo ? "sí" : "no", r.steps.productos ? "sí" : "no",
    r.steps.pedido ? "sí" : "no", r.steps.venta ? "sí" : "no",
  ]);
  const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = `activacion-tiendas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function Kpi({ label, value, tone = "default", sub }: { label: string; value: string; tone?: "default" | "good" | "warn" | "bad"; sub?: string }) {
  const c = tone === "good" ? "text-[var(--data-success-600,#059669)]" : tone === "warn" ? "text-[#0d9488]" : tone === "bad" ? "text-[var(--data-error-600,#dc2626)]" : "text-[var(--text-primary)]";
  return (
    <div className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-1 font-display text-2xl font-extrabold tabular-nums ${c}`}>{value}</p>
      {sub && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{sub}</p>}
    </div>
  );
}

function isDoubleRisk(r: Row) {
  return !r.complete && r.trialDaysLeft != null && r.trialDaysLeft >= 0 && r.trialDaysLeft <= 7;
}

export default function TenantsOnboardingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastAt, setLastAt] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("progress");
  const [detail, setDetail] = useState<Row | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hideContacted, setHideContacted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSuperadmin("/api/superadmin/tenants/onboarding");
      if (res.ok) {
        const d = (await res.json()) as { rows: Row[]; summary: Summary };
        setRows(d.rows ?? []);
        setSummary(d.summary ?? null);
        setLastAt(new Date().toISOString());
      }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Auto-refresh cada 60s (pausa en background).
  useEffect(() => {
    const id = setInterval(() => { if (!(typeof document !== "undefined" && document.hidden)) void load(); }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Embudo de activación: cuántas tiendas completaron cada hito.
  const funnel = useMemo(() => STEPS.map((s) => ({ step: s, count: rows.filter((r) => r.steps[s]).length })), [rows]);

  // KPIs extra.
  const kpis = useMemo(() => {
    const stuck = rows.filter((r) => !r.complete);
    const stuckByStep = STEPS.map((s) => ({ s, n: rows.filter((r) => r.stuckAt === s).length }));
    const worst = stuckByStep.sort((a, b) => b.n - a.n)[0];
    const avgAge = stuck.length ? Math.round(stuck.reduce((acc, r) => acc + r.ageDays, 0) / stuck.length) : 0;
    return {
      activationPct: rows.length ? Math.round((rows.filter((r) => r.complete).length / rows.length) * 100) : 0,
      worstStep: worst && worst.n > 0 ? STEP_META[worst.s].label : "—",
      avgStuckAge: avgAge,
      oldStuck: rows.filter((r) => !r.complete && r.ageDays >= OLD_DAYS).length,
      doubleRisk: rows.filter(isDoubleRisk).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "complete" && !r.complete) return false;
      if (statusFilter === "stuck" && r.complete) return false;
      if (statusFilter.startsWith("stuck:") && r.stuckAt !== statusFilter.slice(6)) return false;
      if (hideContacted && r.contactStatus !== "none") return false;
      if (q && !`${r.name} ${r.slug}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter, hideContacted]);

  const contactedCount = useMemo(() => rows.filter((r) => r.contactStatus !== "none").length, [rows]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "age") return b.ageDays - a.ageDays;
      return a.done - b.done || b.ageDays - a.ageDays; // progress: estancadas primero
    });
  }, [filtered, sort]);

  const impersonate = useCallback(async (slug: string) => {
    setImpersonating(slug);
    try {
      const res = await fetch("/api/superadmin/impersonate", {
        method: "POST", credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ slug }),
      });
      if (res.ok) window.open(`/t/${encodeURIComponent(slug)}/admin`, "_blank");
    } finally { setImpersonating(null); }
  }, []);

  // #10 — marcar contactada / posponer / reset.
  const contact = useCallback(async (slug: string, action: "contacted" | "snooze" | "reset", snoozeDays?: number) => {
    setBusy(slug);
    try {
      await fetchSuperadmin("/api/superadmin/tenants/onboarding/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action, ...(snoozeDays ? { snoozeDays } : {}) }),
      });
      await load();
      setDetail((d) => (d && d.slug === slug ? null : d));
    } finally { setBusy(null); }
  }, [load]);

  const hasFilters = search !== "" || statusFilter !== "all";
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count));

  return (
    <>
      <SuperAdminModuleTabs tabs={TENANTS_TABS} />
      <AdminTabShell
        title="Activación de tiendas"
        kicker="Plataforma · Tiendas"
        description="Hitos de setup completados por cada tienda. Reactiva las estancadas."
        icon={Rocket}
        actions={
          <div className="flex items-center gap-2">
            {lastAt && <span className="hidden sm:inline text-xs text-[var(--text-tertiary)] tabular-nums">Actualizado {new Date(lastAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })} · auto 60s</span>}
            <button onClick={() => exportCSV(sorted)} disabled={sorted.length === 0} className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
              <Download className="h-4 w-4" /> CSV
            </button>
            <button onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
            </button>
            <Link href="/superadmin/tenants" className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40">
              <ArrowLeft className="h-4 w-4" /> Tiendas
            </Link>
          </div>
        }
      >
        {/* KPIs (3 base + extra) */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <Kpi label="Total" value={String(summary.total)} />
            <Kpi label="Activadas" value={String(summary.complete)} tone="good" sub={`${kpis.activationPct}% del total`} />
            <Kpi label="Estancadas" value={String(summary.stuck)} tone="warn" />
            <Kpi label="Paso que más traba" value={kpis.worstStep} />
            <Kpi label="Antigüedad prom." value={`${kpis.avgStuckAge}d`} sub="estancadas" />
            <Kpi label="Doble riesgo" value={String(kpis.doubleRisk)} tone={kpis.doubleRisk > 0 ? "bad" : "good"} sub="estancada + trial" />
          </div>
        )}

        {/* Embudo de activación */}
        {rows.length > 0 && (
          <div className="mb-4 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
            <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Embudo de activación</h3>
            <div className="space-y-2.5">
              {funnel.map((f, i) => {
                const prev = i === 0 ? f.count : funnel[i - 1].count;
                const drop = i === 0 || prev === 0 ? 0 : Math.round(((prev - f.count) / prev) * 100);
                const Icon = STEP_META[f.step].icon;
                return (
                  <button key={f.step} type="button" onClick={() => setStatusFilter(`stuck:${f.step}`)} title={`Ver estancadas en ${STEP_META[f.step].label}`} className="flex w-full items-center gap-3 text-left group">
                    <Icon className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] group-hover:text-[var(--accent)]" />
                    <span className="w-24 shrink-0 text-sm font-semibold text-[var(--text-primary)]">{STEP_META[f.step].label}</span>
                    <div className="flex-1 h-3 rounded bg-[var(--surface-sunken)] overflow-hidden">
                      <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${Math.round((f.count / maxFunnel) * 100)}%` }} />
                    </div>
                    <span className="w-12 shrink-0 text-right text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{f.count}</span>
                    <span className="w-14 shrink-0 text-right text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">{i > 0 ? `−${drop}%` : "base"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tienda o slug…" className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-10 pr-9 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]" />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpiar" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X className="h-4 w-4" /></button>}
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} aria-label="Filtrar por estado" className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer">
            <option value="all">Todas</option>
            <option value="stuck">Estancadas</option>
            <option value="complete">Activadas</option>
            {STEPS.map((s) => <option key={s} value={`stuck:${s}`}>Trabada en {STEP_META[s].label}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar" className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer">
            <option value="progress">Orden: progreso</option>
            <option value="age">Orden: antigüedad</option>
            <option value="name">Orden: nombre</option>
          </select>
          {contactedCount > 0 && (
            <button type="button" onClick={() => setHideContacted((v) => !v)} aria-pressed={hideContacted} className={["inline-flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition-colors shrink-0", hideContacted ? "bg-[var(--accent)] text-white" : "border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"].join(" ")}>
              <Check className="h-4 w-4" /> Ocultar contactadas <span className="tabular-nums opacity-80">{contactedCount}</span>
            </button>
          )}
        </div>

        {loading && rows.length === 0 ? (
          <div className="space-y-2">{[0,1,2,3,4].map((i) => <div key={i} className="h-16 animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-soft)]" />)}</div>
        ) : sorted.length === 0 ? (
          <div className="border-2 border-dashed border-[var(--rule-base)] py-12 text-center">
            <p className="text-sm font-bold text-[var(--text-primary)]">Ninguna tienda con estos filtros</p>
            {hasFilters && <button type="button" onClick={() => { setSearch(""); setStatusFilter("all"); }} className="mt-2 text-sm font-bold text-[var(--accent)] hover:underline">Limpiar filtros</button>}
          </div>
        ) : (
          <>
            <p className="text-xs text-[var(--text-tertiary)] mb-2 tabular-nums">{sorted.length} de {rows.length} tiendas</p>
            <div className="border border-[var(--rule-base)] divide-y divide-[var(--rule-base)]">
              {sorted.map((r) => {
                const old = !r.complete && r.ageDays >= OLD_DAYS;
                const risk = isDoubleRisk(r);
                return (
                  <div key={r.slug} className={`flex flex-wrap items-center gap-4 px-3 py-3 ${risk ? "bg-[var(--data-error-500)]/8" : !r.complete ? "bg-teal-500/5" : ""}`}>
                    <button type="button" onClick={() => setDetail(r)} className="min-w-[160px] flex-1 text-left">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                        {r.name}
                        {risk && <span className="rounded-full bg-[var(--data-error-500)] px-1.5 py-0.5 text-[10px] font-extrabold text-white">trial −{r.trialDaysLeft}d</span>}
                        {old && !risk && <span className="rounded-full bg-[#0d9488]/15 px-1.5 py-0.5 text-[10px] font-extrabold text-[#0d9488]">{r.ageDays}d</span>}
                        {r.contactStatus === "contacted" && <span className="rounded-full bg-[var(--data-success-500)]/15 px-1.5 py-0.5 text-[10px] font-extrabold text-[var(--data-success-600,#059669)]">contactada</span>}
                        {r.contactStatus === "snoozed" && <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] font-extrabold text-[var(--text-tertiary)]">pospuesta</span>}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)]">{r.complete ? "Activada ✓" : `Estancada en: ${r.stuckAt ? STEP_META[r.stuckAt].label : "—"}`}</p>
                    </button>
                    <div className="flex items-center gap-1.5">
                      {STEPS.map((s) => {
                        const done = r.steps[s]; const Icon = STEP_META[s].icon;
                        return (
                          <span key={s} title={`${STEP_META[s].label}: ${done ? "hecho" : "pendiente"}`} className={`inline-flex h-8 w-8 items-center justify-center border ${done ? "bg-[var(--data-success-500)]/15 border-[var(--data-success-500)]/40 text-[var(--data-success-600,#059669)]" : "bg-[var(--surface-sunken)] border-[var(--rule-soft)] text-[var(--text-tertiary)]"}`}>
                            {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
                          </span>
                        );
                      })}
                    </div>
                    <span className="tabular-nums text-sm font-bold text-[var(--text-secondary)] w-12 text-right">{r.done}/{r.total}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => void impersonate(r.slug)} disabled={impersonating === r.slug} title="Impersonar para completar el paso" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] disabled:opacity-50">
                        <ExternalLink className="h-3.5 w-3.5" /> Entrar
                      </button>
                      {!r.complete && (
                        <Link href={`/superadmin/chat?tenant=${r.slug}&msg=${encodeURIComponent(reactivateMsg(r.name, r.stuckAt))}`} title={reactivateMsg(r.name, r.stuckAt)} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline">
                          <MessageSquare className="h-3.5 w-3.5" /> Reactivar
                        </Link>
                      )}
                      {!r.complete && r.contactStatus === "none" ? (
                        <>
                          <button type="button" disabled={busy === r.slug} onClick={() => void contact(r.slug, "contacted")} title="Marcar contactada" aria-label="Marcar contactada" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--data-success-600,#059669)] disabled:opacity-40"><Check className="h-4 w-4" /></button>
                          <button type="button" disabled={busy === r.slug} onClick={() => void contact(r.slug, "snooze", 7)} title="Posponer 7 días" aria-label="Posponer" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--accent)] disabled:opacity-40"><Clock className="h-4 w-4" /></button>
                        </>
                      ) : !r.complete ? (
                        <button type="button" disabled={busy === r.slug} onClick={() => void contact(r.slug, "reset")} title="Deshacer contacto" aria-label="Deshacer" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-40"><X className="h-4 w-4" /></button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </AdminTabShell>

      {/* Drawer de detalle */}
      {detail && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setDetail(null)} aria-hidden />
          <aside role="dialog" aria-label={`Detalle de ${detail.name}`} className="fixed top-0 right-0 h-full w-full max-w-md z-[61] bg-[var(--surface-raised)] border-l border-[var(--rule-base)] shadow-[var(--shadow-xl)] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] shrink-0">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-[var(--text-primary)] truncate">{detail.name}</h2>
                <p className="text-xs text-[var(--text-tertiary)] truncate font-mono">{detail.slug} · {detail.plan}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} aria-label="Cerrar" className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] shrink-0"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Kpi label="Progreso" value={`${detail.done}/${detail.total}`} tone={detail.complete ? "good" : "warn"} />
                <Kpi label="Días desde alta" value={`${detail.ageDays}d`} tone={detail.ageDays >= OLD_DAYS && !detail.complete ? "bad" : "default"} />
              </div>
              {detail.trialDaysLeft != null && (
                <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${isDoubleRisk(detail) ? "border-[var(--data-error-500)] bg-[var(--data-error-500)]/5 text-[var(--data-error-600,#dc2626)]" : "border-[var(--rule-soft)] text-[var(--text-secondary)]"}`}>
                  <Clock className="h-4 w-4 shrink-0" />
                  Trial: {detail.trialDaysLeft >= 0 ? `vence en ${detail.trialDaysLeft}d` : `venció hace ${-detail.trialDaysLeft}d`}
                  {isDoubleRisk(detail) && <span className="ml-auto font-extrabold">DOBLE RIESGO</span>}
                </div>
              )}
              <div>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Hitos de activación</p>
                <ul className="space-y-1.5">
                  {STEPS.map((s) => {
                    const done = detail.steps[s]; const Icon = STEP_META[s].icon;
                    return (
                      <li key={s} className="flex items-center gap-2.5 text-sm">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${done ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-600,#059669)]" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"}`}>
                          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
                        </span>
                        <span className={done ? "text-[var(--text-primary)] font-semibold" : "text-[var(--text-tertiary)]"}>{STEP_META[s].label}</span>
                        {!done && detail.stuckAt === s && <span className="ml-auto text-[length:var(--ts-2xs)] font-bold text-[#0d9488]">← se trabó acá</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
              {!detail.complete && (
                <div className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
                  <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">Mensaje sugerido</p>
                  <p className="text-sm text-[var(--text-secondary)]">{reactivateMsg(detail.name, detail.stuckAt)}</p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => void impersonate(detail.slug)} disabled={impersonating === detail.slug} className="inline-flex flex-1 h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
                  <ExternalLink className="h-4 w-4" /> Impersonar
                </button>
                {!detail.complete && (
                  <Link href={`/superadmin/chat?tenant=${detail.slug}&msg=${encodeURIComponent(reactivateMsg(detail.name, detail.stuckAt))}`} className="inline-flex flex-1 h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] text-sm font-bold text-white hover:brightness-110">
                    <MessageSquare className="h-4 w-4" /> Reactivar
                  </Link>
                )}
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
