"use client";

/**
 * TenantErrorsConsole — errores EN VIVO del panel admin de los negocios (Brandon
 * 2026-06-19, idea #1). Stats de triage, filtro por negocio, y por cada error:
 * Impersonar (entrar a reproducir), Contactar (chat con mensaje contextual) y
 * Resolver. Datos reales de /api/superadmin/tenant-errors (polling 15s).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldAlert, AlertTriangle, Store, Clock, RefreshCw, LogIn, MessageSquare, Check, ChevronDown, Search } from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";
import { csrfHeaders } from "@/lib/csrf-client";

type ErrRow = { id: string; tenantId: string; tenantName: string; tenantSlug: string | null; digest: string | null; message: string; source: string; count: number; firstSeenAt: string; lastSeenAt: string };
type Stats = { groups: number; totalOccurrences: number; affectedTenants: number; lastHour: number };
type Data = { errors: ErrRow[]; stats: Stats };

const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "recién";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
};

export function TenantErrorsConsole() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/superadmin/tenant-errors", { credentials: "include", cache: "no-store" });
      if (res.ok) setD((await res.json()) as Data);
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useVisiblePolling(() => void load(true), 15_000);

  const resolve = useCallback(async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch("/api/superadmin/tenant-errors", {
        method: "POST", credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "resolve", id }),
      });
      setToast(res.ok ? "Error marcado como resuelto ✓" : "No se pudo resolver");
      await load(true);
    } catch (err) { console.error("[sa-tenant-errors] resolve failed", err); setToast("Error en la acción"); } finally { setBusy(null); setTimeout(() => setToast(null), 4000); }
  }, [load]);

  const impersonate = useCallback(async (slug: string | null) => {
    if (!slug) { setToast("Negocio sin slug"); setTimeout(() => setToast(null), 3000); return; }
    setBusy(slug);
    try {
      const res = await fetch("/api/superadmin/impersonate", {
        method: "POST", credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ slug }),
      });
      if (res.ok) window.open(`/t/${encodeURIComponent(slug)}/admin`, "_blank");
      else setToast("No se pudo impersonar");
    } catch (err) { console.error("[sa-tenant-errors] impersonate failed", err); setToast("Error al impersonar"); } finally { setBusy(null); setTimeout(() => setToast(null), 3000); }
  }, []);

  const byTenant = useMemo(() => {
    if (!d) return [];
    const m = new Map<string, { name: string; count: number }>();
    for (const e of d.errors) {
      const k = e.tenantId;
      const prev = m.get(k) ?? { name: e.tenantName, count: 0 };
      prev.count += 1;
      m.set(k, prev);
    }
    return [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [d]);

  const filtered = useMemo(() => {
    if (!d) return [];
    let list = tenantFilter === "all" ? d.errors : d.errors.filter((e) => e.tenantId === tenantFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) => e.message.toLowerCase().includes(q) || e.source.toLowerCase().includes(q),
      );
    }
    return list;
  }, [d, tenantFilter, search]);

  if (loading && !d) return <div className="h-64 animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />;
  if (!d) return null;
  const s = d.stats;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SAKpiCard icon={ShieldAlert} label="Errores activos" value={s.groups} sub="grupos sin resolver" tone={s.groups > 0 ? "warn" : "good"} />
        <SAKpiCard icon={AlertTriangle} label="Ocurrencias" value={s.totalOccurrences} sub="veces que pasaron" tone={s.totalOccurrences > 0 ? "bad" : "default"} />
        <SAKpiCard icon={Store} label="Negocios afectados" value={s.affectedTenants} tone={s.affectedTenants > 0 ? "warn" : "good"} />
        <SAKpiCard icon={Clock} label="Última hora" value={s.lastHour} sub="grupos vistos" />
      </div>

      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]"><ShieldAlert className="h-4 w-4" strokeWidth={1.75} aria-hidden /></span>
            <div>
              <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">Errores en vivo del panel de los negocios</h3>
              <p className="text-xs text-[var(--text-tertiary)]">Impersonar = entrar a reproducir · Contactar = chat con el dueño · auto 15s</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {toast && <span className="hidden sm:inline text-xs font-bold text-[var(--accent)]">{toast}</span>}
            <button type="button" onClick={() => void load()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)]/40"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
        </header>

        <div className="p-4 space-y-3">
          {s.groups === 0 ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 px-3.5 py-3">
              <Check className="h-5 w-5 text-[var(--data-success-600)] shrink-0" />
              <p className="text-sm font-bold text-[var(--text-primary)]">Sin errores — los paneles admin de los negocios están sanos.</p>
            </div>
          ) : (
            <>
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por mensaje o source…"
                  aria-label="Buscar errores"
                  className="w-full h-9 pl-8 pr-3 text-sm rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Por negocio:</span>
                <button type="button" onClick={() => setTenantFilter("all")} className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${tenantFilter === "all" ? "bg-[var(--accent)] text-white" : "border border-[var(--rule-base)] text-[var(--text-secondary)]"}`}>Todos <span className="tabular-nums opacity-70">{d.errors.length}</span></button>
                {byTenant.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTenantFilter(t.id)} className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${tenantFilter === t.id ? "bg-[var(--accent)] text-white" : "border border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40"}`}>
                    <span className="truncate max-w-[150px]">{t.name}</span> <span className="tabular-nums opacity-70">{t.count}</span>
                  </button>
                ))}
              </div>

              <ul className="border border-[var(--rule-soft)] divide-y divide-[var(--rule-soft)]">
                {filtered.map((e) => {
                  const open = expanded.has(e.id);
                  const msg = `Hola, vimos un error en tu panel${e.source ? ` (${e.source})` : ""}. Lo estamos revisando para ayudarte a resolverlo.`;
                  return (
                    <li key={e.id} className="px-3 py-2.5">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {e.tenantSlug ? (
                              <Link href={`/superadmin/tenants/${encodeURIComponent(e.tenantSlug)}`} className="inline-flex items-center gap-1 text-sm font-extrabold text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline"><Store className="h-3.5 w-3.5 text-[var(--accent)]" /> {e.tenantName}</Link>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-sm font-extrabold text-[var(--text-primary)]"><Store className="h-3.5 w-3.5 text-[var(--accent)]" /> {e.tenantName}</span>
                            )}
                            {e.source && <span className="font-mono text-xs text-[var(--text-tertiary)]">{e.source}</span>}
                            {e.count > 1 && <span className="rounded-full bg-[var(--data-error-500)]/10 px-1.5 py-0.5 text-xs font-extrabold text-[var(--data-error-600)] tabular-nums">×{e.count}</span>}
                            <span className="text-xs text-[var(--text-tertiary)]">· {ago(e.lastSeenAt)}</span>
                          </div>
                          <button type="button" onClick={() => setExpanded((p) => { const n = new Set(p); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })} className="mt-0.5 inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-left">
                            <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} /> <span className="truncate max-w-[460px]">{e.message}</span>
                          </button>
                          {open && <pre className="mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-sunken)] p-2.5 font-mono text-xs text-[var(--text-secondary)]">{e.message}{e.digest ? `\n\ndigest: ${e.digest}` : ""}</pre>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button type="button" disabled={busy === e.tenantSlug} onClick={() => void impersonate(e.tenantSlug)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50" title="Entrar al panel del negocio a reproducir"><LogIn className="h-3.5 w-3.5" /> Impersonar</button>
                          {e.tenantSlug && <Link href={`/superadmin/chat?tenant=${encodeURIComponent(e.tenantSlug)}&msg=${encodeURIComponent(msg)}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Contactar al dueño"><MessageSquare className="h-3.5 w-3.5" /> Contactar</Link>}
                          <button type="button" disabled={busy === e.id} onClick={() => void resolve(e.id)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50" title="Marcar resuelto"><Check className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
