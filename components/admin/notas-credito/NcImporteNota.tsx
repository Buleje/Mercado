"use client";

import { Field } from "@/components/admin/shared/Field";
import { formatCurrency } from "@/lib/format";
import { reglaMotivo } from "@/lib/notas-credito/motivos";
import type { RemanenteDocumento } from "@/lib/notas-credito/remanente";
import type { ImporteNota } from "@/components/admin/notas-credito/nc-importe";
import { AmountBreakdown } from "@/components/admin/notas-credito/NcWizardPiezas";

/**
 * El importe según la forma del motivo (F11): «todo» muestra lo que queda sin pedir nada; «importe» pide
 * la base sin IGV con su tope; «líneas» y «descripción» lo suman de las unidades elegidas (`NcLineasNota`).
 */
export default function NcImporteNota({ codigo, importe, remanente, tasa, baseEscrita, setBase }: {
  codigo: string;
  importe: ImporteNota;
  remanente: RemanenteDocumento | null;
  tasa: number;
  baseEscrita: string;
  setBase: (v: string) => void;
}) {
  const regla = reglaMotivo(codigo);
  return (
    <div className="space-y-3">
      {importe.forma === "todo" && remanente && (
        <p className="rounded-xl bg-[var(--surface-sunken)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          Va por <strong className="text-[var(--text-primary)]">todo lo que queda: {formatCurrency(remanente.disponibleConIgv)}</strong> con IGV. Para una parte usa 07 o 09.
        </p>
      )}

      {importe.forma === "importe" && (
        <Field label={`${regla.queSeAcredita}, sin IGV (S/)`} labelClassName="block text-sm font-bold text-[var(--text-secondary)] mb-1">
          {(id) => (
            <div className="flex flex-wrap items-center gap-2">
              <input id={id} data-qa="nc-base" inputMode="decimal" value={baseEscrita} onChange={(e) => setBase(e.target.value)} placeholder="0,00"
                className="h-12 w-40 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30" />
              {remanente && remanente.disponibleBase > 0 && (
                <>
                  <span className="text-sm text-[var(--text-secondary)]">Base afectada: hasta {formatCurrency(remanente.disponibleBase)}</span>
                  <button type="button" onClick={() => setBase(remanente.disponibleBase.toFixed(2))}
                    className="min-h-12 rounded-xl px-3 text-sm font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)]">
                    Todo lo que queda
                  </button>
                </>
              )}
            </div>
          )}
        </Field>
      )}

      {importe.desglose.total > 0 && (
        <AmountBreakdown monto={importe.desglose.monto} igv={importe.desglose.igv} total={importe.desglose.total} originalTotal={remanente?.totalDocumento} tasa={tasa} />
      )}
      {!remanente && importe.forma === "importe" && (
        <p className="text-sm text-[var(--text-tertiary)]">Sin documento el IGV es un estimado al {Math.round(tasa * 100)} %: al guardar se usa el de tu negocio.</p>
      )}
    </div>
  );
}
