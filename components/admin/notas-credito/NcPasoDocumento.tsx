"use client";

import { LoadingState } from "@buleje/design-system";
import { m, AnimatePresence } from "@/components/admin/providers";
import { formatCurrency } from "@/lib/format";
import { Search, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { DOC_STYLE, PICKER_TABS } from "@/components/admin/notas-credito/nc-compartido";
import { SaleDocCard } from "@/components/admin/notas-credito/NcWizardPiezas";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";

/** Asistente, paso 1: elegir el documento. Pieza de NotasCreditoModule: recibe `useNotasCredito` entero. */
export default function NcPasoDocumento({ nc }: { nc: NotasCreditoVista }) {
  const {
    wizardStep, setWizardStep, setForm, pickerDocs, pickerLoading, pickerSearch, setPickerSearch,
    pickerDocType, setPickerDocType, selectedVenta, setSelectedVenta, filteredPickerDocs, pickerCounts,
  } = nc;
  return (
    <>
      {wizardStep === 0 && (
        <div className="space-y-6">
          <p className="text-sm text-[var(--text-secondary)]">
            Selecciona el documento original (factura, boleta o ticket) al que quieres aplicar la nota de cr{"\u00e9"}dito
          </p>

          {/* Doc Type Picker Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[var(--surface-sunken)] rounded-xl">
            {PICKER_TABS.map(tab => (
              <button key={tab.id} onClick={() => setPickerDocType(tab.id)}
                className={cn("flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all",
                  pickerDocType === tab.id
                    ? "bg-[var(--surface-raised)] text-[var(--text-primary)] "
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span className={cn("px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold",
                  pickerDocType === tab.id ? "bg-primary text-white" : "bg-[var(--rule-soft)] text-[var(--text-secondary)]")}>
                  {pickerCounts[tab.id]}
                </span>
              </button>
            ))}
          </div>

          {/* Picker Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input type="text" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
              placeholder="Buscar por número, cliente, RUC/DNI..."
              className="w-full pl-9 pr-3 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30" />
            {pickerLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--text-tertiary)]" />}
          </div>

          {/* Selected Document Banner */}
          <AnimatePresence>
            {selectedVenta && (
              <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="bg-primary/5 border-2 border-primary/30 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{(DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).icon}</span>
                      <span className={cn("px-2 py-0.5 rounded-lg text-[length:var(--ts-2xs)] font-bold uppercase", (DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).badge)}>
                        {(DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).label}
                      </span>
                      <span className="font-mono text-sm font-bold text-primary">
                        {selectedVenta.comprobanteNumero || `#${selectedVenta.número}`}
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)]">{"\u00b7"} {selectedVenta.clienteNombre}</span>
                      <span className="text-sm font-bold text-[var(--text-primary)]">{"\u00b7"} {formatCurrency(selectedVenta.total)}</span>
                    </div>
                    <button onClick={() => setSelectedVenta(null)} className="text-xs font-bold text-[var(--data-error-500)] hover:underline px-2 py-1 rounded-lg hover:bg-[var(--data-error-50)] transition-colors">
                      Quitar
                    </button>
                  </div>
                  <div className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)] font-bold flex items-center gap-1">
                    <span>{"\u2713"}</span> Documento seleccionado {"\u2014"} en el paso siguiente podr{"\u00e1"}s elegir qu{"\u00e9"} items devolver
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* Document Cards Grid */}
          {pickerLoading && pickerDocs.length === 0 ? (
            <LoadingState message="Cargando documentos..." />
          ) : filteredPickerDocs.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">{"\u{1F50D}"}</div>
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">No se encontraron documentos</p>
              <p className="text-xs text-[var(--text-tertiary)]">Intenta con otro t{"\u00e9"}rmino de b{"\u00fasqueda"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-85 overflow-y-auto pr-1 scrollbar-thin">
              <AnimatePresence>
                {filteredPickerDocs.map(doc => (
                  <SaleDocCard key={doc.id} doc={doc} isSelected={selectedVenta?.id === doc.id}
                    onSelect={() => { setSelectedVenta(selectedVenta?.id === doc.id ? null : doc); setForm(prev => ({ ...prev, orderId: selectedVenta?.id === doc.id ? "" : doc.id })); }} />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-[var(--rule-soft)]">
            <button type="button" onClick={() => { setSelectedVenta(null); setForm(prev => ({ ...prev, orderId: "" })); setWizardStep(1); }}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:underline transition-colors">
              Continuar sin documento {"\u2192"}
            </button>
            <div className="flex-1" />
            <button onClick={() => setWizardStep(1)} disabled={!selectedVenta}
              className={cn("px-6 min-h-11 rounded-xl text-sm font-semibold transition-all",
                selectedVenta
                  ? "text-white bg-primary hover:bg-primary-dark "
                  : "text-[var(--text-tertiary)] bg-[var(--surface-sunken)] cursor-not-allowed")}>
              Siguiente {"\u2192"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
