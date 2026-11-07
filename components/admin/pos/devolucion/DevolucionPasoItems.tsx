"use client";

import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Loader2, Check, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { type SaleRecord, MOTIVOS, fmt, fmtDate } from "@/components/admin/pos/devolucion/devolucion-shared";
import type { Devolucion } from "@/components/admin/pos/devolucion/use-devolucion";

/** Paso 2: qué se devuelve, cuánto, por qué y cómo se devuelve la plata. */
export default function DevolucionPasoItems({ dev, selectedSale }: { dev: Devolucion; selectedSale: SaleRecord }) {
  const {
    returnItems, toggleItem, updateReturnQty, motivo, setMotivo, refundType, setRefundType,
    selectedCount, returnTotal, setStep, handleConfirm, processing,
  } = dev;
  return (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="bg-[var(--surface-sunken)] rounded-xl p-3">
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  Venta #{selectedSale.id.slice(0, 8)} · {fmtDate(selectedSale.createdAt)}
                </p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Total original: {fmt(selectedSale.total)}</p>
              </div>

              <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                ¿Qué devuelve el cliente?
              </p>

              <div className="space-y-2">
                {returnItems.map((item, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "p-3 rounded-xl border transition-colors",
                      item.selected
                        ? "border-primary bg-primary/5"
                        : "border-[var(--rule-soft)]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleItem(idx)}
                        aria-label={`Seleccionar ${item.name}`}
                        className="h-4 w-4 rounded border-[var(--rule-base)] text-primary focus:ring-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-[var(--text-primary)] truncate">{item.name}</p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{fmt(item.price)} x {item.maxQty} = {fmt(item.price * item.maxQty)}</p>
                      </div>
                      {item.selected && (
                        <Field label="Cant:" labelClassName="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]" className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={item.maxQty}
                            value={item.returnQty}
                            onChange={e => updateReturnQty(idx, parseInt(e.target.value) || 0)}
                            className="w-14 px-2 py-1 rounded-xl border border-[var(--rule-base)] text-xs text-center text-[var(--text-primary)] bg-[var(--surface-raised)] outline-none focus:border-primary"
                          />
                        </Field>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Motivo */}
              <Field label="Motivo" labelClassName="block text-xs font-bold text-[var(--text-secondary)] mb-1">
                <select
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {MOTIVOS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>

              {/* Refund type */}
              <div>
                <span className="mb-1 flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)]">
                  Devuelve como
                  <InfoTip
                    ariaLabel="Cómo se devuelve la plata"
                    what="Efectivo: la plata sale de la caja. Crédito en tienda: queda a favor del cliente, ligado a su teléfono."
                    affects="Devolver en efectivo lo autoriza sólo el dueño o un admin; un cajero elige Crédito en tienda."
                    example="Boleta con 2 leches de S/ 4.50: devuelve 1 → S/ 4.50 en efectivo, o S/ 4.50 de crédito para su próxima compra."
                  />
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-pressed={refundType === "efectivo"}
                    onClick={() => setRefundType("efectivo")}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-xs font-bold transition-colors",
                      refundType === "efectivo"
                        ? "bg-primary text-white"
                        : "bg-[var(--rule-soft)] text-[var(--text-secondary)] hover:bg-[var(--rule-base)]"
                    )}
                  >
                    Efectivo
                  </button>
                  <button
                    type="button"
                    aria-pressed={refundType === "credito"}
                    onClick={() => setRefundType("credito")}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-xs font-bold transition-colors",
                      refundType === "credito"
                        ? "bg-secondary text-white"
                        : "bg-[var(--rule-soft)] text-[var(--text-secondary)] hover:bg-[var(--rule-base)]"
                    )}
                  >
                    Crédito en tienda
                  </button>
                </div>
                {refundType === "credito" && !selectedSale.customerPhone && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
                    Esta venta no tiene teléfono del cliente: el crédito no queda guardado a su nombre.
                  </p>
                )}
              </div>

              {/* Summary */}
              {selectedCount > 0 && (
                <div className="bg-primary/5 rounded-xl p-3 border border-primary/20">
                  <p className="text-xs text-[var(--text-secondary)]">
                    {selectedCount} ítem{selectedCount !== 1 ? "s" : ""} a devolver
                  </p>
                  <p className="text-lg font-extrabold text-primary">{fmt(returnTotal)}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-[var(--text-secondary)] bg-[var(--rule-soft)] hover:bg-[var(--rule-base)] transition-colors"
                >
                  Atrás
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={selectedCount === 0 || processing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 min-h-11 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Confirmar devolución
                </button>
              </div>
            </div>
  );
}
