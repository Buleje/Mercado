"use client";

import { PrimaryButton } from "@buleje/design-system";
import { Field } from "@/components/admin/shared/Field";
import type { Promociones } from "@/components/admin/promociones/hooks/use-promociones";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";

/** Ventana «Nueva / Editar campaña». Pieza de PromotionsTab: recibe `usePromociones` entero. */
export default function CampanaFormModal({ prm }: { prm: Promociones }) {
  const {
    showCampaignForm,
    editingCampaignId,
    campaignForm,
    setCampaignForm,
    savingCampaign,
    closeCampaignFormModal,
    saveCampaign,
  } = prm;
  return (
    <>
      {/* ── Campaign Form Modal ───────────────────────────────────────────── */}
      {showCampaignForm && (
        <AdminModal
          open
          onClose={closeCampaignFormModal}
          title={editingCampaignId ? "Editar campaña" : "Nueva campaña programada"}
          size="lg"
          claveVentana="promociones-campana-form"
          footer={
            <ModalFooter>
              <PrimaryButton variant="secondary" onClick={closeCampaignFormModal}>
                Cancelar
              </PrimaryButton>
              <PrimaryButton
                variant="primary"
                onClick={saveCampaign}
                disabled={!campaignForm.name.trim() || !campaignForm.startDate}
                loading={savingCampaign}
              >
                {savingCampaign
                  ? "Guardando"
                  : editingCampaignId
                    ? "Guardar cambios"
                    : "Crear campaña"}
              </PrimaryButton>
            </ModalFooter>
          }
        >
          <div className={`space-y-4 ${MODAL_BODY}`}>
            {/* Name */}
            <Field
              label="Nombre de campaña *"
              labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
            >
              <input
                type="text"
                value={campaignForm.name}
                onChange={(e) => setCampaignForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary"
                placeholder="Ej: Campaña de Verano"
              />
            </Field>
            {/* Description */}
            <Field
              label="Descripción"
              labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
            >
              <textarea
                value={campaignForm.description}
                onChange={(e) => setCampaignForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary resize-none"
                placeholder="Detalles de la campaña…"
              />
            </Field>
            {/* Target Segment */}
            <Field
              label="Segmento objetivo *"
              labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
            >
              <select
                value={campaignForm.targetSegment}
                onChange={(e) => setCampaignForm((f) => ({ ...f, targetSegment: e.target.value }))}
                className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary bg-[var(--surface-raised)] "
              >
                <option value="all">Todos</option>
                <option value="champions">Champions</option>
                <option value="loyal">Loyal</option>
                <option value="at-risk">At Risk</option>
                <option value="lost">Lost</option>
                <option value="new">New</option>
                <option value="promising">Promising</option>
              </select>
            </Field>
            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Fecha/hora inicio *"
                labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
              >
                <input
                  type="datetime-local"
                  value={campaignForm.startDate ? campaignForm.startDate.slice(0, 16) : ""}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary text-[var(--text-secondary)] dark:text-muted"
                />
              </Field>
              <Field
                label="Fecha/hora fin"
                labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
              >
                <input
                  type="datetime-local"
                  value={campaignForm.endDate ? campaignForm.endDate.slice(0, 16) : ""}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary text-[var(--text-secondary)] dark:text-muted"
                />
              </Field>
            </div>
            {/* Message Template */}
            <Field
              label="Mensaje con placeholders"
              labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
            >
              {(id) => (
                <>
                  <textarea
                    id={id}
                    value={campaignForm.messageTemplate}
                    onChange={(e) =>
                      setCampaignForm((f) => ({ ...f, messageTemplate: e.target.value }))
                    }
                    rows={4}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary resize-none font-mono"
                    placeholder="¡Hola {name}! Tenemos un {discount}% de descuento especial para ti..."
                  />
                  <p className="text-sm text-[var(--text-tertiary)] dark:text-muted mt-1">
                    Variables: {"{name}"}, {"{discount}"}, {"{code}"}
                  </p>
                </>
              )}
            </Field>
            {/* Discount Code */}
            <Field
              label="Código de descuento"
              labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
            >
              <input
                type="text"
                value={campaignForm.discountCode}
                onChange={(e) =>
                  setCampaignForm((f) => ({ ...f, discountCode: e.target.value.toUpperCase() }))
                }
                className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary font-mono"
                placeholder="VERANO20"
              />
            </Field>
            {/* Auto-send toggle */}
            <div className="flex flex-wrap items-center gap-3 p-3 bg-[var(--surface-sunken)] rounded-xl">
              <input
                type="checkbox"
                id="autoSend"
                checked={campaignForm.autoSend}
                onChange={(e) => setCampaignForm((f) => ({ ...f, autoSend: e.target.checked }))}
                className="rounded border-[var(--rule-base)] text-primary focus:ring-primary"
              />
              <label
                htmlFor="autoSend"
                className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] cursor-pointer flex-1"
              >
                Enviar automáticamente al inicio de la campaña
                <span className="block text-sm text-[var(--text-tertiary)] dark:text-muted font-normal">
                  Las notificaciones se enviarán por WhatsApp al segmento seleccionado
                </span>
              </label>
            </div>
          </div>
        </AdminModal>
      )}
    </>
  );
}
