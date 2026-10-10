"use client";

import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { X, AlertTriangle, MessageCircle } from "@buleje/design-system/icons";
import { CardTitle, LoadingState } from "@buleje/design-system";
import { formatCurrency } from "@/lib/format";
import { safeMdToHtml } from "@/components/admin/promociones/promociones-compartido";
import type { Promociones } from "@/components/admin/promociones/hooks/use-promociones";

/** Ventanas de sugerencias de IA, borrar y plantillas de temporada. Pieza de PromotionsTab: recibe `usePromociones` entero. */
export default function PromoVentanasChicas({ prm }: { prm: Promociones }) {
  const {
    showAiModal, aiSuggestions, aiError, loadingAi, confirmDeleteId, showTemplates, campaignTemplates,
    applyTemplate, aiModalRef, aiTitleId, closeAiModal, ventanaAi, deleteModalRef, deleteTitleId,
    closeDeleteModal, templatesModalRef, templatesTitleId, closeTemplatesModal, ventanaTemplates,
    confirmDelete,
  } = prm;
  return (
    <>
      {/* ── AI Suggestions Modal ──────────────────────────────────────────── */}
      {showAiModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50" style={{ zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget && !ventanaAi.fijado) closeAiModal(); }}>
          <div ref={aiModalRef} role="dialog" aria-modal="true" aria-labelledby={aiTitleId} tabIndex={-1} className="relative bg-[var(--surface-raised)] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div {...ventanaAi.asaProps} className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, #8b5cf6, #9333ea)' }}>
                  <MessageCircle className="h-4 w-4 text-white" />
                </div>
                <CardTitle id={aiTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Sugerencias IA</CardTitle>
              </div>
              <span className="ml-auto flex items-center gap-1">
                <ControlesDeVentana ventana={ventanaAi} />
              </span>
              <button aria-label="Cerrar" onClick={closeAiModal} className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--rule-soft)] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {loadingAi ? (
                <LoadingState message="Analizando datos de clientes y ventas..." />
              ) : aiSuggestions && aiError ? (
                <div className="flex items-start gap-2 text-sm text-[var(--data-error-500)]">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                  <p>{aiSuggestions}</p>
                </div>
              ) : aiSuggestions ? (
                <div className="space-y-0.5" dangerouslySetInnerHTML={{ __html: safeMdToHtml(aiSuggestions) }} />
              ) : (
                <p className="text-sm text-[var(--text-tertiary)] dark:text-muted text-center py-10">No hay sugerencias disponibles.</p>
              )}
            </div>
            <TiradorDeVentana ventana={ventanaAi} />
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 200 }} onClick={closeDeleteModal}>
          <div ref={deleteModalRef} role="dialog" aria-modal="true" aria-labelledby={deleteTitleId} tabIndex={-1} className="bg-[var(--surface-raised)] rounded-xl w-full max-w-sm p-3 sm:p-6" onClick={e => e.stopPropagation()}>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[var(--data-error-100)] flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)]" />
              </div>
              <div>
                <CardTitle id={deleteTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">¿Eliminar promoción?</CardTitle>
                <p className="text-sm text-[var(--text-secondary)] dark:text-muted">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={closeDeleteModal} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-[var(--rule-soft)] dark:bg-accent hover:bg-[var(--rule-base)] transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="flex-1 min-h-11 rounded-xl text-sm font-semibold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] transition-colors">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Campaign Templates Modal ── */}
      {showTemplates && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget && !ventanaTemplates.fijado) closeTemplatesModal(); }}>
          <div ref={templatesModalRef} role="dialog" aria-modal="true" aria-labelledby={templatesTitleId} tabIndex={-1} className="relative bg-[var(--surface-raised)] rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div {...ventanaTemplates.asaProps} className="flex items-center justify-between px-5 py-4 border-b dark:border-[var(--rule-base)] shrink-0">
              <div>
                <CardTitle id={templatesTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Plantillas de Campaña</CardTitle>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Selecciona una plantilla y personalízala</p>
              </div>
              <span className="ml-auto flex items-center gap-1">
                <ControlesDeVentana ventana={ventanaTemplates} />
              </span>
              <button aria-label="Cerrar" onClick={closeTemplatesModal} className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {campaignTemplates.map((tpl) => (
                <button
                  key={tpl.name}
                  onClick={() => applyTemplate(tpl)}
                  className="w-full flex flex-wrap items-center gap-3 p-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:bg-[var(--data-warning-50)] dark:hover:bg-[var(--data-warning-500)]/10 hover:border-[var(--data-warning-500)] dark:hover:border-[var(--data-warning-500)] transition-all text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--data-warning-500)]/12 text-[var(--data-warning-500)]">
                    <tpl.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{tpl.name}</p>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{tpl.description}</p>
                    <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-semibold mt-0.5">{tpl.form.discountPercent}% off · Mín. {formatCurrency(tpl.form.minPurchase)}</p>
                  </div>
                </button>
              ))}
            </div>
            <TiradorDeVentana ventana={ventanaTemplates} />
          </div>
        </div>
      )}
    </>
  );
}
