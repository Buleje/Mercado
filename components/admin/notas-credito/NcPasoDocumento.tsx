"use client";

import { LoadingState } from "@buleje/design-system";
import { AnimatePresence } from "@/components/admin/providers";
import { Search, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { PICKER_TABS } from "@/components/admin/notas-credito/nc-compartido";
import { SaleDocCard } from "@/components/admin/notas-credito/NcWizardPiezas";
import NcDocumentoElegido from "@/components/admin/notas-credito/NcDocumentoElegido";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";

/** Asistente, paso 1: elegir el documento. Pieza de NotasCreditoModule: recibe `useNotasCredito` entero. */
export default function NcPasoDocumento({ nc }: { nc: NotasCreditoVista }) {
  const {
    wizardStep, setWizardStep, setForm, pickerDocs, pickerLoading, pickerSearch, setPickerSearch,
    pickerDocType, setPickerDocType, selectedVenta, setSelectedVenta, filteredPickerDocs, pickerCounts,
    remanente, copiaDe, limpiarDocumento,
  } = nc;
  const quitar = () => { setSelectedVenta(null); limpiarDocumento(); setForm((prev) => ({ ...prev, orderId: "" })); };
  // Sin lo que queda leído todavía se deja seguir: el paso 2 frena con el aviso y el servidor pone el tope.
  const agotado = !!selectedVenta && (remanente.datos?.remanente.disponibleConIgv ?? 1) <= 0;
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
                className={cn("flex-1 flex items-center justify-center gap-1.5 px-3 min-h-12 rounded-xl text-sm font-bold transition-all",
                  pickerDocType === tab.id
                    ? "bg-[var(--surface-raised)] text-[var(--text-primary)] "
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>
                <tab.icon className="h-4 w-4" aria-hidden />
                <span>{tab.label}</span>
                <span className={cn("px-1.5 py-0.5 rounded-full text-sm font-bold",
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
              placeholder="Código, cliente, DNI/RUC, celular, monto o producto"
              className="w-full pl-9 pr-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30" />
            {pickerLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--text-tertiary)]" />}
          </div>

          {copiaDe && (
            <p role="note" className="rounded-xl bg-[var(--surface-sunken)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              Copiaste el motivo y el texto de <strong className="text-[var(--text-primary)]">{copiaDe}</strong>; el documento y el importe se eligen de nuevo.
            </p>
          )}

          {selectedVenta && <NcDocumentoElegido venta={selectedVenta} remanente={remanente} onQuitar={quitar} />}

          {/* Document Cards Grid */}
          {pickerLoading && pickerDocs.length === 0 ? (
            <LoadingState message="Cargando documentos..." />
          ) : filteredPickerDocs.length === 0 ? (
            <div className="text-center py-10">
              <Search className="mx-auto mb-3 h-10 w-10 text-[var(--text-tertiary)]" aria-hidden />
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">No se encontraron documentos</p>
              <p className="text-sm text-[var(--text-tertiary)]">Intenta con otro t{"\u00e9"}rmino de b{"\u00fasqueda"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-85 overflow-y-auto pr-1 scrollbar-thin">
              <AnimatePresence>
                {filteredPickerDocs.map(doc => (
                  <SaleDocCard key={doc.id} doc={doc} isSelected={selectedVenta?.id === doc.id}
                    onSelect={() => { if (selectedVenta?.id === doc.id) { quitar(); return; } setSelectedVenta(doc); setForm(prev => ({ ...prev, orderId: doc.id })); }} />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-[var(--rule-soft)]">
            <button type="button" onClick={() => { quitar(); setWizardStep(1); }}
              title="La nota no queda vinculada a ninguna boleta ni factura: es un ajuste interno"
              className="min-h-12 px-3 text-sm text-[var(--text-secondary)] hover:underline transition-colors">
              Seguir sin documento (ajuste interno) {"\u2192"}
            </button>
            <div className="flex-1" />
            <button type="button" data-qa="nc-siguiente-documento" onClick={() => setWizardStep(1)} disabled={!selectedVenta || agotado}
              title={agotado ? "Ya está acreditada entera" : undefined}
              className={cn("px-6 min-h-12 rounded-xl text-sm font-semibold transition-all",
                selectedVenta && !agotado
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
