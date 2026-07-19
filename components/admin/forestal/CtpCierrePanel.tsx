"use client";

/**
 * CtpCierrePanel — cierre de período fiscal del Libro CTP (ADR-139).
 *
 * Cerrar un mes: congela costos + snapshotea la existencia de cierre + BLOQUEA
 * toda edición de ese mes. Es lo que vuelve al libro un acta inmutable. Reabrir
 * (owner) deja de bloquear, pero los costos congelados siguen congelados.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";

const URL = "/api/admin/forestal/ctp/cierre";
const fmt4 = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const fmtFecha = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

interface MonthOpt { key: string; label: string; year: number; month: number }
function buildMonths(): MonthOpt[] {
  const out: MonthOpt[] = [];
  const now = new Date();
  // Desde el mes ANTERIOR hacia atrás (un mes se cierra una vez terminado).
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("es-PE", { month: "long", year: "numeric" }),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    });
  }
  return out;
}

export default function CtpCierrePanel() {
  const [cierres, setCierres] = useState<CtpCierrePeriodo[] | null>(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCierres([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const closedKeys = useMemo(() => new Set((cierres ?? []).filter((c) => !c.reabierto).map((c) => c.periodKey)), [cierres]);
  useEffect(() => {
    if (!sel) { const first = months.find((m) => !closedKeys.has(m.key)); if (first) setSel(first.key); }
  }, [months, closedKeys, sel]);

  const selMonth = months.find((m) => m.key === sel);
  const selCerrado = closedKeys.has(sel);

  async function cerrar() {
    if (!selMonth || busy) return;
    setBusy(true); setError(null); setOkMsg(null);
    try {
      const r = await fetch(URL, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action: "cerrar", year: selMonth.year, month: selMonth.month }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setCierres(Array.isArray(j.cierres) ? j.cierres : cierres);
      const t = j.cierre?.totales;
      setOkMsg(`Período ${selMonth.label} cerrado${t ? ` · ${t.corridasCongeladas} corridas congeladas${t.corridasSinCostear ? `, ${t.corridasSinCostear} sin costear` : ""}` : ""}. Quedó bloqueado.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reabrir(c: CtpCierrePeriodo) {
    const motivo = window.prompt(`Reabrir ${c.label}. Los costos ya congelados siguen congelados; el período vuelve a admitir ediciones.\n\nMotivo (obligatorio, queda auditado):`);
    if (!motivo || !motivo.trim()) return;
    setBusy(true); setError(null); setOkMsg(null);
    try {
      const r = await fetch(URL, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action: "reabrir", periodKey: c.periodKey, motivo: motivo.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setCierres(Array.isArray(j.cierres) ? j.cierres : cierres);
      setOkMsg(`Período ${c.label} reabierto.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-dark)]"><Lock className="h-5 w-5" /></span>
          <div className="min-w-0">
            <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">Cerrar un mes del libro</CardTitle>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Al cerrar, se congela el costo de las corridas del mes, se guarda la existencia de cierre (apertura del mes siguiente) y el período queda <strong>bloqueado</strong>: no se pueden agregar, anular ni reatribuir líneas de ese mes.</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Error:</strong> {error}</div>
          </div>
        )}
        {okMsg && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] p-3 text-sm text-[var(--data-success-700)]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><div>{okMsg}</div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-[var(--text-secondary)]">Mes a cerrar</span>
            <select value={sel} onChange={(e) => setSel(e.target.value)} disabled={busy} className="h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base font-bold text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]">
              {months.map((m) => (
                <option key={m.key} value={m.key} disabled={closedKeys.has(m.key)}>
                  {m.label}{closedKeys.has(m.key) ? " — cerrado" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void cerrar()}
            disabled={busy || selCerrado || !selMonth}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {selCerrado ? "Ya cerrado" : `Cerrar ${selMonth?.label ?? ""}`}
          </button>
        </div>
      </div>

      {/* Períodos cerrados */}
      <div>
        <CardTitle as="h3" className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]"><ShieldCheck className="h-4 w-4" /> Períodos cerrados</CardTitle>
        {cierres === null ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>
        ) : cierres.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-tertiary)]">Todavía no cerraste ningún mes. El libro sigue completamente editable.</p>
        ) : (
          <ul className="space-y-3">
            {cierres.map((c) => {
              const open = expanded === c.periodKey;
              return (
                <li key={c.periodKey} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${c.reabierto ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" : "bg-[var(--data-success-100)] text-[var(--data-success-700)]"}`}>
                        {c.reabierto ? <RotateCcw className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      </span>
                      <div>
                        <p className="text-sm font-bold capitalize text-[var(--text-primary)]">{c.label}{c.reabierto ? " · reabierto" : ""}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">Cerró {c.closedBy} · {fmtFecha(c.closedAt)} · {c.totales.corridasCongeladas} corridas congeladas{c.totales.corridasSinCostear ? ` · ${c.totales.corridasSinCostear} sin costear` : ""}{c.totales.especiesEnNegativo ? ` · ⚠ ${c.totales.especiesEnNegativo} especies en negativo` : ""}</p>
                        {c.reabierto && <p className="text-xs text-[var(--data-warning-700)]">Reabierto por {c.reabierto.by} · {c.reabierto.motivo}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setExpanded(open ? null : c.periodKey)} aria-expanded={open} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                        Existencia de cierre <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                      </button>
                      {!c.reabierto && (
                        <button type="button" onClick={() => void reabrir(c)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60">
                          <RotateCcw className="h-3.5 w-3.5" /> Reabrir
                        </button>
                      )}
                    </div>
                  </div>
                  {open && (
                    <div className="mt-3 grid gap-4 border-t border-[var(--rule-soft)] pt-3 md:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Materia prima (m³)</p>
                        {c.saldoCierre.materiaPrima.length === 0 ? <p className="text-sm text-[var(--text-tertiary)]">Sin existencia.</p> : (
                          <ul className="space-y-1 text-sm">
                            {c.saldoCierre.materiaPrima.map((e, i) => (
                              <li key={i} className="flex justify-between gap-2">
                                <span className="text-[var(--text-secondary)]">{e.especie}{e.cites ? " · CITES" : ""}</span>
                                <span className={`font-bold ${e.existenciaM3 < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{fmt4(e.existenciaM3)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Productos</p>
                        {c.saldoCierre.productos.length === 0 ? <p className="text-sm text-[var(--text-tertiary)]">Sin stock.</p> : (
                          <ul className="space-y-1 text-sm">
                            {c.saldoCierre.productos.map((p, i) => (
                              <li key={i} className="flex justify-between gap-2">
                                <span className="text-[var(--text-secondary)]">{p.producto}</span>
                                <span className={`font-bold ${p.existencia < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{fmt4(p.existencia)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
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
