"use client";

/**
 * DLQEvents — DLQ de eventos accionable (Brandon 2026-06-19). Stats de triage,
 * filtro por handler, y por cada evento botones Resolver (marca resuelto) y
 * Reintentar (re-emite el evento). Datos reales de /api/superadmin/dlq/events.
 * Reusa SAKpiCard + useVisiblePolling.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, AlertTriangle, Clock, Layers, RefreshCw, RotateCcw, Check, ChevronDown } from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";
import { csrfHeaders } from "@/lib/csrf-client";

type Event = { id: string; tenantId: string; eventType: string; handlerName: string; attemptCount: number; failedAt: string; lastError: string };
type Stats = { unresolved: number; nearMax: number; oldestFailedAt: string | null; byHandler: { handler: string; count: number }[]; byEventType: { eventType: string; count: number }[] };
type Data = { events: Event[]; stats: Stats };

const ago = (iso: string | null) => {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
};

export function DLQEvents() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [handlerFilter, setHandlerFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/superadmin/dlq/events", { credentials: "include", cache: "no-store" });
      if (res.ok) setD((await res.json()) as Data);
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useVisiblePolling(() => void load(true), 30_000);

  const act = useCallback(async (action: "resolve" | "retry", id: string) => {
    setBusy(id);
    try {
      const res = await fetch("/api/superadmin/dlq/events", {
        method: "POST", credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action, id }),
      });
      const r = await res.json().catch(() => ({}));
      if (action === "retry") setToast(r.resolved ? "Reintentado con éxito ✓" : `Reintentado, sigue fallando: ${String(r.error ?? "").slice(0, 60)}`);
      else setToast(r.ok ? "Marcado como resuelto ✓" : "No se pudo resolver");
      await load(true);
    } catch { setToast("Error en la acción"); } finally { setBusy(null); setTimeout(() => setToast(null), 4000); }
  }, [load]);

  const filtered = useMemo(() => {
    if (!d) return [];
    return handlerFilter === "all" ? d.events : d.events.filter((e) => e.handlerName === handlerFilter);
  }, [d, handlerFilter]);

  if (loading && !d) return <div className="h-48 animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />;
  if (!d) return null;
  const s = d.stats;

  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]"><Inbox className="h-4 w-4" strokeWidth={1.75} aria-hidden /></span>
          <div>
            <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">Eventos en DLQ — accionable</h3>
            <p className="text-xs text-[var(--text-tertiary)]">Resolver = marcar manejado · Reintentar = re-emitir el evento</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {toast && <span className="hidden sm:inline text-xs font-bold text-[var(--accent)]">{toast}</span>}
          <button type="button" onClick={() => void load()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)]/40"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></button>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Stats de triage */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SAKpiCard icon={Inbox} label="Sin resolver" value={s.unresolved} tone={s.unresolved > 0 ? "warn" : "good"} />
          <SAKpiCard icon={AlertTriangle} label="Casi sin reintentos" value={s.nearMax} sub="≥4 intentos" tone={s.nearMax > 0 ? "bad" : "default"} />
          <SAKpiCard icon={Clock} label="Más viejo" value={ago(s.oldestFailedAt)} sub="sin resolver" />
          <SAKpiCard icon={Layers} label="Handlers afectados" value={s.byHandler.length} />
        </div>

        {s.unresolved === 0 ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 px-3.5 py-3">
            <Check className="h-5 w-5 text-[var(--data-success-600,#059669)] shrink-0" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Sin eventos en DLQ — todo procesado.</p>
          </div>
        ) : (
          <>
            {/* Triage por handler (filtro) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Por handler:</span>
              <button type="button" onClick={() => setHandlerFilter("all")} className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${handlerFilter === "all" ? "bg-[var(--accent)] text-white" : "border border-[var(--rule-base)] text-[var(--text-secondary)]"}`}>Todos <span className="tabular-nums opacity-70">{s.unresolved}</span></button>
              {s.byHandler.map((h) => (
                <button key={h.handler} type="button" onClick={() => setHandlerFilter(h.handler)} className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${handlerFilter === h.handler ? "bg-[var(--accent)] text-white" : "border border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40"}`}>
                  <span className="font-mono truncate max-w-[160px]">{h.handler}</span> <span className="tabular-nums opacity-70">{h.count}</span>
                </button>
              ))}
            </div>

            {/* Lista de eventos */}
            <ul className="border border-[var(--rule-soft)] divide-y divide-[var(--rule-soft)]">
              {filtered.map((e) => {
                const open = expanded.has(e.id);
                return (
                  <li key={e.id} className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-[var(--text-primary)] truncate">{e.eventType}</span>
                          <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">{e.handlerName}</span>
                          <span className={`text-[length:var(--ts-2xs)] font-bold tabular-nums ${e.attemptCount >= 4 ? "text-[var(--data-error-600,#dc2626)]" : "text-[var(--text-tertiary)]"}`}>{e.attemptCount} intento{e.attemptCount === 1 ? "" : "s"}</span>
                          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">· {ago(e.failedAt)}</span>
                        </div>
                        <button type="button" onClick={() => setExpanded((p) => { const n = new Set(p); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })} className="mt-0.5 inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} /> <span className="truncate max-w-[420px] text-left">{e.lastError}</span>
                        </button>
                        {open && <pre className="mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-sunken)] p-2.5 font-mono text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{e.lastError}</pre>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button type="button" disabled={busy === e.id} onClick={() => void act("retry", e.id)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Reintentar</button>
                        <button type="button" disabled={busy === e.id} onClick={() => void act("resolve", e.id)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Resolver</button>
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
  );
}
