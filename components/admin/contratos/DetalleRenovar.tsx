"use client";

import { Loader2, ArrowRight } from "@buleje/design-system/icons";
import type { DbContract } from "@/lib/types/contracts";
import type { EstadoContratos } from "./use-contratos";
export default function DetalleRenovar({ arch }: { arch: EstadoContratos }) {
  const { mesesRenovacion, setMesesRenovacion, renovarContrato, renovando, renovarError } = arch;
  /* La ficha sólo se monta con un contrato abierto (la condición vive en ContratosModule). */
  const selected = arch.selected as DbContract;
  return (
    <>
                  <div className="p-3 rounded-xl bg-[var(--surface-alt)] space-y-2">
                    <p className="text-xs text-[var(--text-secondary)]">
                      Renovar crea un contrato nuevo con las mismas condiciones y las fechas corridas.
                      El actual queda archivado como renovado, sin perder qué estuvo vigente y cuándo.
                    </p>
                    <div className="flex items-center gap-2">
                      <select
                        value={mesesRenovacion}
                        onChange={e => setMesesRenovacion(Number(e.target.value))}
                        className="px-2.5 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)]"
                        aria-label="Meses de renovación"
                      >
                        {[3, 6, 12, 24, 36].map(m => (
                          <option key={m} value={m}>{m} meses</option>
                        ))}
                      </select>
                      <button
                        onClick={() => renovarContrato(selected)}
                        disabled={renovando}
                        // Renovar es constructivo: en coral lleno se leía como
                        // una acción destructiva, justo al lado del badge rojo
                        // de "Vencido".
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] border-2 border-primary/40 hover:bg-primary/10 transition-colors disabled:opacity-60"
                      >
                        {renovando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                        Renovar contrato
                      </button>
                    </div>
                    {renovarError && <p className="text-xs text-[var(--data-error-500)]">{renovarError}</p>}
                  </div>
    </>
  );
}