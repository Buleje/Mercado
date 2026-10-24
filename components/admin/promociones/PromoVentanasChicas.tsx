"use client";

import { AlertTriangle, MessageCircle } from "@buleje/design-system/icons";
import { LoadingState } from "@buleje/design-system";
import { formatCurrency } from "@/lib/format";
import { safeMdToHtml } from "@/components/admin/promociones/promociones-compartido";
import type { Promociones } from "@/components/admin/promociones/hooks/use-promociones";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

/** Ventanas de sugerencias de IA, borrar y plantillas de temporada. Pieza de PromotionsTab: recibe `usePromociones` entero. */
export default function PromoVentanasChicas({ prm }: { prm: Promociones }) {
  const {
    showAiModal,
    aiSuggestions,
    aiError,
    loadingAi,
    confirmDeleteId,
    showTemplates,
    campaignTemplates,
    applyTemplate,
    closeAiModal,
    closeDeleteModal,
    closeTemplatesModal,
    confirmDelete,
  } = prm;
  return (
    <>
      {/* ── AI Suggestions Modal ──────────────────────────────────────────── */}
      {showAiModal && (
        <AdminModal
          open
          onClose={closeAiModal}
          title="Sugerencias IA"
          icon={MessageCircle}
          size="lg"
          claveVentana="promociones-ia"
        >
          <div className={MODAL_BODY}>
            {loadingAi ? (
              <LoadingState message="Analizando datos de clientes y ventas..." />
            ) : aiSuggestions && aiError ? (
              <div className="flex items-start gap-2 text-sm text-[var(--data-error-500)]">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                <p>{aiSuggestions}</p>
              </div>
            ) : aiSuggestions ? (
              <div
                className="space-y-0.5"
                dangerouslySetInnerHTML={{ __html: safeMdToHtml(aiSuggestions) }}
              />
            ) : (
              <p className="text-sm text-[var(--text-tertiary)] dark:text-muted text-center py-10">
                No hay sugerencias disponibles.
              </p>
            )}
          </div>
        </AdminModal>
      )}

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      {confirmDeleteId && (
        <AdminModal
          open
          onClose={closeDeleteModal}
          title="¿Eliminar oferta?"
          icon={AlertTriangle}
          size="sm"
          footer={
            <ModalFooter>
              <button onClick={closeDeleteModal} className={button({ variant: "secondary" })}>
                Cancelar
              </button>
              <button onClick={confirmDelete} className={button({ variant: "danger" })}>
                Sí, eliminar
              </button>
            </ModalFooter>
          }
        >
          <p className={`text-sm text-[var(--text-secondary)] ${MODAL_BODY}`}>
            Esta acción no se puede deshacer.
          </p>
        </AdminModal>
      )}

      {/* ── Campaign Templates Modal ── */}
      {showTemplates && (
        <AdminModal
          open
          onClose={closeTemplatesModal}
          title="Plantillas de campaña"
          description="Elige una plantilla y personalízala"
          size="md"
          claveVentana="promociones-plantillas"
        >
          <div className={`space-y-2 ${MODAL_BODY}`}>
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
                  <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                    {tpl.name}
                  </p>
                  <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
                    {tpl.description}
                  </p>
                  <p className="text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-semibold mt-0.5">
                    {tpl.form.discountPercent}% off · Mín. {formatCurrency(tpl.form.minPurchase)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </AdminModal>
      )}
    </>
  );
}
