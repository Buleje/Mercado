"use client";

/**
 * CtpCierrePanel — historial de períodos cerrados del Libro CTP (ADR-139).
 *
 * Cerrar un mes congela costos, snapshotea la existencia de cierre y BLOQUEA
 * toda edición de ese mes: es lo que vuelve al libro un acta inmutable. Cerrar
 * lo hace el asistente de arriba (único selector de mes); acá vive lo que ya se
 * cerró y el único camino de vuelta: reabrir (owner), que deja de bloquear pero
 * NO descongela los costos.
 */

import { useState } from "react";
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
import type { CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";
import type { CtpCierresState } from "@/hooks/use-ctp-cierres";
const fmt4 = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const fmtFecha = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function CtpCierrePanel({ estado }: { estado: CtpCierresState }) {
  const { cierres, error, busy } = estado;
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function reabrir(c: CtpCierrePeriodo) {
    const motivo = window.prompt(`Reabrir ${c.label}. Los costos ya congelados siguen congelados; el período vuelve a admitir ediciones.\n\nMotivo (obligatorio, queda auditado):`);
    if (!motivo || !motivo.trim()) return;
    setOkMsg(null);
    const r = await estado.reabrir(c, motivo.trim());
    if (r.ok) setOkMsg(r.msg);
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Error:</strong> {error}</div>
        </div>
      )}
      {okMsg && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] p-3 text-sm text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><div>{okMsg}</div>
        </div>
      )}

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
