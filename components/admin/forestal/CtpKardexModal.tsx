"use client";

/**
 * CtpKardexModal — cuenta corriente de la materia prima de UNA especie.
 *
 * Saldos muestra el balance NETO; esto muestra los MOVIMIENTOS que lo formaron:
 * cada ingreso (+) y cada consumo en producción (−) en orden cronológico, con el
 * saldo corriente después de cada uno. Es el detalle que un fiscalizador
 * reconstruye a mano. El saldo final coincide con el de la pestaña Saldos.
 */

import { useCallback, useEffect, useState } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { MODAL_BODY } from "./ctp-shared";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Scale } from "@buleje/design-system/icons";
import { LoadingState } from "@buleje/design-system";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";

interface Mov { fecha: string; tipo: "ingreso" | "consumo"; doc: string; entra: number; sale: number; saldo: number }
interface Kardex { especie: string; movimientos: Mov[]; ingresoTotal: number; consumoTotal: number; saldo: number }

const n4 = (v: number) => v.toFixed(4);
// entryDate es date-only a medianoche UTC → sin timeZone:UTC se corre un día.
const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); } catch { return iso; } };

export default function CtpKardexModal({ especie, period, onClose }: { especie: string; period: CtpPeriod; onClose: () => void }) {
  const [k, setK] = useState<Kardex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = applyCtpPeriodParams(new URLSearchParams({ kardex: especie }), period);
      const r = await fetch(`/api/admin/forestal/ctp?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setK((await r.json()).kardex ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [especie, period]);
  useEffect(() => { void load(); }, [load]);

  return (
    <AdminModal open onClose={onClose} variant="info" title={`Kardex · ${especie}`} description={`Movimientos de materia prima en ${period.label}`} icon={Scale}>
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {loading && <LoadingState message="Cargando movimientos…" className="py-8" />}
        {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

        {k && !loading && (
          <>
            {/* Resumen (sidebar) + movimientos (tabla) lado a lado. */}
            <div className="grid gap-4 lg:grid-cols-[15rem_1fr] lg:items-start">
            <div className="space-y-3">
              <Stat label="Ingresado" value={`${n4(k.ingresoTotal)} m³`} tone="ok" />
              <Stat label="Consumido" value={`${n4(k.consumoTotal)} m³`} />
              <Stat label="Saldo" value={`${n4(k.saldo)} m³`} tone={k.saldo < 0 ? "bad" : "ok"} />
              <p className="text-xs text-[var(--text-tertiary)]">El saldo final coincide con la pestaña Saldos. Consumo = m³ declarados en las corridas de producción de esta especie.</p>
            </div>

            <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-sunken)] text-left">
                  <tr>
                    <th className="px-3 py-2.5 font-bold text-[var(--text-primary)]">Fecha</th>
                    <th className="px-3 py-2.5 font-bold text-[var(--text-primary)]">Documento</th>
                    <th className="px-3 py-2.5 text-right font-bold text-[var(--text-primary)]">Entra</th>
                    <th className="px-3 py-2.5 text-right font-bold text-[var(--text-primary)]">Sale</th>
                    <th className="px-3 py-2.5 text-right font-bold text-[var(--text-primary)]">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {k.movimientos.map((m, i) => (
                    <tr key={i} className="border-t border-[var(--rule-soft)]">
                      <td className="px-3 py-2.5 whitespace-nowrap text-[var(--text-secondary)]">{fmtDate(m.fecha)}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)]">
                          {m.tipo === "ingreso" ? <ArrowUpRight className="h-3.5 w-3.5 text-[var(--data-success-600)]" /> : <ArrowDownRight className="h-3.5 w-3.5 text-[var(--data-warning-600)]" />}
                          {m.doc}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--data-success-700)]">{m.entra > 0 ? n4(m.entra) : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--data-warning-700)]">{m.sale > 0 ? n4(m.sale) : "—"}</td>
                      <td className="px-3 py-2.5 text-right"><span className={`font-mono font-bold tabular-nums ${m.saldo < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{n4(m.saldo)}</span></td>
                    </tr>
                  ))}
                </tbody>
                {k.movimientos.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
                      <td className="px-3 py-2.5 text-[var(--text-primary)]" colSpan={2}>Totales</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--data-success-700)]">{n4(k.ingresoTotal)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--data-warning-700)]">{n4(k.consumoTotal)}</td>
                      <td className="px-3 py-2.5 text-right"><span className={`font-mono tabular-nums ${k.saldo < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{n4(k.saldo)}</span></td>
                    </tr>
                  </tfoot>
                )}
              </table>
              {k.movimientos.length === 0 && <div className="p-8 text-center text-sm text-[var(--text-tertiary)]">Sin movimientos de {especie} en {period.label}.</div>}
            </div>
            </div>
          </>
        )}
      </div>
    </AdminModal>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color = tone === "bad" ? "text-[var(--data-error-700)]" : tone === "ok" ? "text-[var(--data-success-700)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-0.5 font-mono text-base font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
