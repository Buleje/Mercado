"use client";

import { Field } from "@/components/admin/shared/Field";
import { m, AnimatePresence } from "@/components/admin/providers";
import { formatCurrency } from "@/lib/format";
import { Plus, DollarSign, Minus, BookmarkPlus, Bookmark } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { MOTIVOS_SUNAT } from "@/components/admin/notas-credito/nc-compartido";
import { MotivoCard, AmountBreakdown } from "@/components/admin/notas-credito/NcWizardPiezas";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";

/** Asistente, paso 2: motivo, ítems y monto. Pieza de NotasCreditoModule: recibe `useNotasCredito` entero. */
export default function NcPasoMotivo({ nc }: { nc: NotasCreditoVista }) {
  const {
    templates, showTemplates, setShowTemplates, wizardStep, setWizardStep, createError,
    setCreateError, form, setForm, selectedVenta, devolverStock, setDevolverStock, esDevolucion,
    autoMonto, handleItemToggle, handleItemQty, montoNum, computedIgv, computedTotal, saveTemplate,
    deleteTemplate, loadTemplate,
  } = nc;
  return (
    <>
      {wizardStep === 1 && (
        <div className="space-y-6">
          {/* ── Templates guardados ─────────────────────────── */}
          {templates.length > 0 && (
            <div className="bg-primary/10 border border-[var(--data-success-500)]/30 rounded-xl p-3">
              <button onClick={() => setShowTemplates(s => !s)} className="flex items-center gap-2 w-full text-xs font-bold text-[var(--data-success-500)]">
                <Bookmark className="h-3.5 w-3.5" />
                Mis templates guardados ({templates.length})
                <span className="ml-auto text-[length:var(--ts-2xs)] text-[var(--data-success-500)]">{showTemplates ? "Ocultar" : "Ver"}</span>
              </button>
              <AnimatePresence>
                {showTemplates && (
                  <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mt-2 space-y-1">
                      {templates.map(t => (
                        <div key={t.id} className="flex items-center gap-2 bg-[var(--surface-raised)] rounded-lg px-3 py-2">
                          <span className="flex-1 text-xs text-[var(--text-primary)]">
                            <strong>{t.name}</strong> — [{t.codigoMotivo}] {t.descripcionMotivo}
                          </span>
                          <button onClick={() => loadTemplate(t)} className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] hover:underline shrink-0">Usar</button>
                          <button onClick={() => deleteTemplate(t.id)} className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)] hover:text-[var(--data-error-500)] shrink-0">x</button>
                        </div>
                      ))}
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Visual Motivo Picker Cards */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="block text-xs font-bold text-[var(--text-secondary)]">Motivo SUNAT {"\u2014"} {"\u00bfPor qu\u00e9"} se emite la NC?</span>
              {form.codigoMotivo && (
                <button onClick={saveTemplate} className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] hover:underline">
                  <BookmarkPlus className="h-3 w-3" />Guardar template
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
              {MOTIVOS_SUNAT.map(m => (
                <MotivoCard key={m.code} motivo={m} selected={form.codigoMotivo === m.code}
                  onClick={() => setForm(prev => ({
                    ...prev,
                    codigoMotivo: m.code,
                    descripcionMotivo: prev.descripcionMotivo || m.label,
                  }))} />
              ))}
            </div>
          </div>

          {/* Description */}
          <Field label={"Descripci\u00f3n del motivo"} labelClassName="block text-xs font-bold text-[var(--text-secondary)] mb-1">
            <textarea value={form.descripcionMotivo} onChange={e => setForm(p => ({ ...p, descripcionMotivo: e.target.value }))} placeholder="Detalle del motivo..." rows={2}
              className="w-full px-3 py-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </Field>

          {/* Item Quantity Picker (if linked to a sale) */}
          {selectedVenta && selectedVenta.items.length > 0 && (
            <div>
              <span className="block text-xs font-bold text-[var(--text-secondary)] mb-2">
                Items a incluir en la NC {"\u2014"} ajusta cantidades para devoluci{"\u00f3"}n parcial
              </span>
              <div className="border border-[var(--rule-base)] rounded-xl divide-y divide-[var(--rule-soft)] overflow-hidden">
                {selectedVenta.items.map((item, idx) => (
                  <div key={idx} className={cn("flex items-center gap-3 p-3 transition-colors", item.selected ? "bg-primary/5" : "hover:bg-[var(--surface-alt)]")}>
                    <button type="button" onClick={() => handleItemToggle(idx)}
                      className={cn("w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0",
                        item.selected ? "bg-primary border-primary text-white" : "border-[var(--rule-base)]")}>
                      {item.selected && <span className="text-[length:var(--ts-2xs)]">{"\u2713"}</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{item.nombre}</p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Comprado: {item.cantidad} {"\u00d7"} {formatCurrency(item.precio)}</p>
                    </div>
                    {item.selected && (
                      <div className="flex items-center gap-1.5">
                        <button aria-label="Disminuir cantidad" type="button" onClick={() => handleItemQty(idx, item.cantidadDevolver - 1)}
                          className="w-7 h-7 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center hover:bg-[var(--rule-soft)] transition-colors">
                          <Minus className="h-3 w-3 text-[var(--text-secondary)]" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold text-[var(--text-primary)]">{item.cantidadDevolver}</span>
                        <button aria-label="Aumentar cantidad" type="button" onClick={() => handleItemQty(idx, item.cantidadDevolver + 1)}
                          className="w-7 h-7 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center hover:bg-[var(--rule-soft)] transition-colors">
                          <Plus className="h-3 w-3 text-[var(--text-secondary)]" />
                        </button>
                      </div>
                    )}
                    <span className={cn("text-sm font-bold w-20 text-right", item.selected ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>
                      {formatCurrency((item.selected ? item.cantidadDevolver : 0) * item.precio)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-xs px-1">
                <span className="text-[var(--text-tertiary)]">{selectedVenta.items.filter(it => it.selected).length} de {selectedVenta.items.length} items seleccionados</span>
                <span className="font-bold text-primary">Subtotal: {formatCurrency(autoMonto)}</span>
              </div>
            </div>
          )}

          {/* Manual amount (if no linked sale or override) */}
          {!selectedVenta && (
            <Field label="Monto a acreditar sin IGV (S/)" labelClassName="block text-xs font-bold text-[var(--text-secondary)] mb-1">
              {(id) => (
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                  <input id={id} type="number" step="0.01" min="0.01" value={form.monto} onChange={e => setForm(p => ({ ...p, monto: e.target.value }))} placeholder="0.00"
                    className="w-full pl-9 pr-3 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              )}
            </Field>
          )}

          {/* Amount Preview */}
          {montoNum > 0 && (
            <AmountBreakdown monto={montoNum} igv={computedIgv} total={computedTotal} originalTotal={selectedVenta?.total} />
          )}

          {/* Notes */}
          <Field label="Notas internas (opcional)" labelClassName="block text-xs font-bold text-[var(--text-secondary)] mb-1">
            <input type="text" value={form.notasText} onChange={e => setForm(p => ({ ...p, notasText: e.target.value }))} placeholder="Observaciones..."
              className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </Field>

          {/* Return stock toggle */}
          {esDevolucion && (
            <div className="bg-[var(--data-warning-50)] border border-[var(--data-warning-500)] rounded-xl p-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setDevolverStock(!devolverStock)}
                  role="switch"
                  aria-checked={devolverStock}
                  aria-label="Devolver items al stock"
                  className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    devolverStock ? "bg-primary" : "bg-[var(--rule-base)]")}>
                  <span className={cn("inline-block h-4 w-4 rounded-full bg-[var(--surface-raised)] transition-transform", devolverStock ? "translate-x-4" : "translate-x-0")} />
                </button>
                <span className="text-xs font-bold text-[var(--data-warning-500)]">{"\u{1F4E6}"} Devolver items al stock</span>
              </div>
            </div>
          )}

          {createError && <p className="text-xs text-[var(--data-error-500)] font-semibold">{createError}</p>}

          {/* Navigation */}
          <div className="flex gap-2 pt-2">
            <button onClick={() => setWizardStep(0)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] transition-colors">
              {"\u2190"} Atr{"\u00e1"}s
            </button>
            <button onClick={() => {
              if (!form.codigoMotivo) { setCreateError("Selecciona un motivo"); return; }
              if (!form.descripcionMotivo.trim()) { setCreateError("Completa la descripci\u00f3n"); return; }
              if (montoNum <= 0) { setCreateError("El monto debe ser mayor a 0"); return; }
              setCreateError(null); setWizardStep(2);
            }} className="flex-1 min-h-11 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors">
              Siguiente {"\u2192"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
