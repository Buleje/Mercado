"use client";

/**
 * CacaoCierrePanel — cierre de período del acopio de cacao (ADR-303). Cerrar un
 * mes congela el acta (KPIs + stock), lo vuelve la apertura del mes siguiente y
 * BLOQUEA la edición de lotes/ventas/ajustes fechados en el mes. Espeja el cierre
 * forestal (ADR-139).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Lock, RotateCcw, ShieldCheck } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CacaoCierrePeriodo } from "@/lib/cacao/cacao-cierre-types";

const URL = "/api/admin/cacao/cierre";
const kg = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })} kg`;
const fmtFecha = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };

interface MonthOpt { key: string; label: string; year: number; month: number }
function buildMonths(): MonthOpt[] {
  const out: MonthOpt[] = [];
  const now = new Date();
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("es-PE", { month: "long", year: "numeric" }), year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

export default function CacaoCierrePanel() {
  const [cierres, setCierres] = useState<CacaoCierrePeriodo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [sel, setSel] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const months = useMemo(buildMonths, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(URL, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setCierres(Array.isArray(j.cierres) ? j.cierres : []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setCierres([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const closedKeys = useMemo(() => new Set((cierres ?? []).filter((c) => !c.reabierto).map((c) => c.periodKey)), [cierres]);
  useEffect(() => { if (!sel) { const f = months.find((m) => !closedKeys.has(m.key)); if (f) setSel(f.key); } }, [months, closedKeys, sel]);
  const selMonth = months.find((m) => m.key === sel);
  const selCerrado = closedKeys.has(sel);

  async function post(body: object): Promise<Record<string, unknown>> {
    const r = await fetch(URL, { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.message ?? j.error ?? `HTTP ${r.status}`) as string);
    return j;
  }

  async function cerrar() {
    if (!selMonth || busy) return;
    setBusy(true); setError(null); setOkMsg(null);
    try {
      const j = await post({ action: "cerrar", year: selMonth.year, month: selMonth.month });
      setCierres(Array.isArray(j.cierres) ? (j.cierres as CacaoCierrePeriodo[]) : cierres);
      const t = (j.cierre as CacaoCierrePeriodo)?.totales;
      setOkMsg(`Campaña de ${selMonth.label} cerrada${t ? ` · ${t.lotes} lotes (${kg(t.acopioKg)}), ${t.ventas} ventas` : ""}. Quedó bloqueada.`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  async function reabrir(c: CacaoCierrePeriodo) {
    const motivo = window.prompt(`Reabrir ${c.label}. Vuelve a admitir ediciones.\n\nMotivo (obligatorio, queda auditado):`);
    if (!motivo || !motivo.trim()) return;
    setBusy(true); setError(null); setOkMsg(null);
    try {
      const j = await post({ action: "reabrir", periodKey: c.periodKey, motivo: motivo.trim() });
      setCierres(Array.isArray(j.cierres) ? (j.cierres as CacaoCierrePeriodo[]) : cierres);
      setOkMsg(`Campaña de ${c.label} reabierta.`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><Lock className="h-5 w-5" /></span>
          <div className="min-w-0">
            <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">Cerrar una campaña</CardTitle>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Al cerrar, se congela el acta del mes (kg acopiado, vendido, stock) y el período queda <strong>bloqueado</strong>: no se pueden agregar ni anular lotes/ventas/ajustes de ese mes. El stock de cierre es la apertura del mes siguiente.</p>
          </div>
        </div>

        {error && <div className="mt-4 flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}
        {okMsg && <div className="mt-4 flex items-start gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] p-3 text-sm text-[var(--data-success-700)]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><div>{okMsg}</div></div>}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-[var(--text-secondary)]">Mes a cerrar</span>
            <select value={sel} onChange={(e) => setSel(e.target.value)} disabled={busy} className="h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base font-bold text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]">
              {months.map((m) => (<option key={m.key} value={m.key} disabled={closedKeys.has(m.key)}>{m.label}{closedKeys.has(m.key) ? " — cerrado" : ""}</option>))}
            </select>
          </label>
          <button type="button" onClick={() => void cerrar()} disabled={busy || selCerrado || !selMonth} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}{selCerrado ? "Ya cerrado" : `Cerrar ${selMonth?.label ?? ""}`}
          </button>
        </div>
      </div>

      <div>
        <CardTitle as="h3" className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]"><ShieldCheck className="h-4 w-4" /> Campañas cerradas</CardTitle>
        {cierres === null ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>
        ) : cierres.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-tertiary)]">Todavía no cerraste ninguna campaña. El acopio sigue completamente editable.</p>
        ) : (
          <ul className="space-y-3">
            {cierres.map((c) => {
              const open = expanded === c.periodKey;
              return (
                <li key={c.periodKey} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${c.reabierto ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" : "bg-[var(--data-success-100)] text-[var(--data-success-700)]"}`}>{c.reabierto ? <RotateCcw className="h-4 w-4" /> : <Lock className="h-4 w-4" />}</span>
                      <div>
                        <p className="text-sm font-bold capitalize text-[var(--text-primary)]">{c.label}{c.reabierto ? " · reabierto" : ""}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">Cerró {c.closedBy} · {fmtFecha(c.closedAt)} · stock de cierre {kg(c.snapshot.stockKg)}</p>
                        {c.reabierto && <p className="text-xs text-[var(--data-warning-700)]">Reabierto por {c.reabierto.by} · {c.reabierto.motivo}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setExpanded(open ? null : c.periodKey)} aria-expanded={open} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Acta <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></button>
                      {!c.reabierto && <button type="button" onClick={() => void reabrir(c)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RotateCcw className="h-3.5 w-3.5" /> Reabrir</button>}
                    </div>
                  </div>
                  {open && (
                    <div className="mt-3 grid gap-4 border-t border-[var(--rule-soft)] pt-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Kpi label="Acopiado (mes)" value={kg(c.totales.acopioKg)} sub={`${c.totales.lotes} lotes`} />
                      <Kpi label="Vendido (mes)" value={kg(c.totales.ventasKg)} sub={`${c.totales.ventas} ventas`} />
                      <Kpi label="Stock de cierre" value={kg(c.snapshot.stockKg)} sub="apertura del mes siguiente" />
                      <Kpi label="Pagado a productores" value={`S/ ${c.snapshot.pagadoProductores.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`} />
                      {c.snapshot.porGrado.length > 0 && (
                        <div className="sm:col-span-2 lg:col-span-4">
                          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Existencia por grado</p>
                          <div className="flex flex-wrap gap-2">
                            {c.snapshot.porGrado.map((g, i) => (<span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]">{g.grado}: {kg(g.kg)}</span>))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-0.5 text-base font-extrabold text-[var(--text-primary)]">{value}</p>
      {sub && <p className="text-xs text-[var(--text-tertiary)]">{sub}</p>}
    </div>
  );
}
