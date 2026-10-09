"use client";

import { formatCurrency } from "@/lib/format";
import { Plus, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { DOC_STYLE, MOTIVOS_SUNAT } from "@/components/admin/notas-credito/nc-compartido";
import { AmountBreakdown } from "@/components/admin/notas-credito/NcWizardPiezas";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";

/** Asistente, paso 3: confirmar y crear. Pieza de NotasCreditoModule: recibe `useNotasCredito` entero. */
export default function NcPasoConfirmar({ nc }: { nc: NotasCreditoVista }) {
  const {
    wizardStep, setWizardStep, creating, createError, form, selectedVenta, devolverStock, esDevolucion,
    montoNum, computedIgv, computedTotal, handleCreate,
  } = nc;
  return (
    <>
      {wizardStep === 2 && (
        <div className="space-y-6">
          {/* Document Reference */}
          {selectedVenta && (
            <div className={cn("rounded-xl p-4 border-2", (DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).border, (DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).bg)}>
              <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)] mb-2">Documento de referencia</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{(DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).icon}</span>
                <div>
                  <span className={cn("px-2 py-0.5 rounded-lg text-[length:var(--ts-2xs)] font-bold uppercase", (DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).badge)}>
                    {(DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).label}
                  </span>
                  <span className="font-mono text-sm font-bold text-[var(--text-primary)] ml-2">{selectedVenta.comprobanteNumero || `#${selectedVenta.número}`}</span>
                </div>
                <div className="flex-1" />
                <div className="text-right">
                  <p className="text-xs text-[var(--text-secondary)]">{selectedVenta.clienteNombre}</p>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(selectedVenta.total)}</p>
                </div>
              </div>

              {/* Items being returned */}
              {selectedVenta.items.filter(it => it.selected).length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--rule-base)]/50 space-y-1">
                  <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)] mb-1">Items incluidos en la NC</p>
                  {selectedVenta.items.filter(it => it.selected).map((it, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-secondary)]">{it.nombre} {"\u00d7"}{it.cantidadDevolver}{it.cantidadDevolver < it.cantidad ? ` (de ${it.cantidad})` : ""}</span>
                      <span className="font-bold text-[var(--text-primary)]">{formatCurrency(it.cantidadDevolver * it.precio)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Motivo Summary */}
          <div className="bg-[var(--surface-alt)] rounded-xl p-4">
            <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)] mb-2">Motivo</p>
            <div className="flex items-center gap-2">
              <span className="text-xl">{MOTIVOS_SUNAT.find(m => m.code === form.codigoMotivo)?.icon || "\u{1F4DD}"}</span>
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">[{form.codigoMotivo}] {form.descripcionMotivo}</p>
                {form.notasText && <p className="text-xs text-[var(--text-tertiary)] italic mt-0.5">{form.notasText}</p>}
              </div>
            </div>
            {esDevolucion && devolverStock && (
              <p className="text-xs text-[var(--data-warning-500)] mt-2 flex items-center gap-1">{"\u{1F4E6}"} Se devolver{"\u00e1"}n items al stock</p>
            )}
          </div>

          {/* Amount Breakdown */}
          <AmountBreakdown monto={montoNum} igv={computedIgv} total={computedTotal} originalTotal={selectedVenta?.total} />

          {createError && <p className="text-xs text-[var(--data-error-500)] font-semibold bg-[var(--data-error-50)] p-3 rounded-xl">{createError}</p>}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button onClick={() => setWizardStep(1)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] transition-colors">
              {"\u2190"} Atr{"\u00e1"}s
            </button>
            <button onClick={handleCreate} disabled={creating}
              className="flex-1 flex items-center justify-center gap-2 px-4 min-h-11 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-all">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Crear Nota de Cr{"\u00e9"}dito
            </button>
          </div>
        </div>
      )}
    </>
  );
}
