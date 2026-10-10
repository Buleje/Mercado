"use client";

import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { X } from "@buleje/design-system/icons";
import { CardTitle, PrimaryButton } from "@buleje/design-system";
import { Field } from "@/components/admin/shared/Field";
import type { Promociones } from "@/components/admin/promociones/hooks/use-promociones";

/** Ventana «Nueva / Editar campaña». Pieza de PromotionsTab: recibe `usePromociones` entero. */
export default function CampanaFormModal({ prm }: { prm: Promociones }) {
  const {
    showCampaignForm, editingCampaignId, campaignForm, setCampaignForm, savingCampaign,
    campaignFormModalRef, campaignFormTitleId, closeCampaignFormModal, ventanaCampaignForm,
    saveCampaign,
  } = prm;
  return (
    <>
      {/* ── Campaign Form Modal ───────────────────────────────────────────── */}
      {showCampaignForm && (
        <div className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/50" style={{ zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget && !ventanaCampaignForm.fijado) closeCampaignFormModal(); }}>
          <div ref={campaignFormModalRef} role="dialog" aria-modal="true" aria-labelledby={campaignFormTitleId} tabIndex={-1} className="relative bg-[var(--surface-raised)] rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div {...ventanaCampaignForm.asaProps} className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
              <CardTitle id={campaignFormTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">{editingCampaignId ? "Editar Campaña" : "Nueva Campaña Programada"}</CardTitle>
              <span className="ml-auto flex items-center gap-1">
                <ControlesDeVentana ventana={ventanaCampaignForm} />
              </span>
              <button aria-label="Cerrar" onClick={closeCampaignFormModal} className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--rule-soft)] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* Name */}
              <Field label="Nombre de campaña *" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <input type="text" value={campaignForm.name} onChange={e => setCampaignForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full mt-1 px-3 h-10 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary" placeholder="Ej: Campaña de Verano" />
              </Field>
              {/* Description */}
              <Field label="Descripción" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <textarea value={campaignForm.description} onChange={e => setCampaignForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary resize-none" placeholder="Detalles de la campaña…" />
              </Field>
              {/* Target Segment */}
              <Field label="Segmento objetivo *" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <select value={campaignForm.targetSegment} onChange={e => setCampaignForm(f => ({ ...f, targetSegment: e.target.value }))}
                  className="w-full mt-1 px-3 h-10 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary bg-[var(--surface-raised)] ">
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
                <Field label="Fecha/hora inicio *" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                  <input type="datetime-local" value={campaignForm.startDate ? campaignForm.startDate.slice(0, 16) : ""} onChange={e => setCampaignForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full mt-1 px-3 h-10 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary text-[var(--text-secondary)] dark:text-muted" />
                </Field>
                <Field label="Fecha/hora fin" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                  <input type="datetime-local" value={campaignForm.endDate ? campaignForm.endDate.slice(0, 16) : ""} onChange={e => setCampaignForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full mt-1 px-3 h-10 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary text-[var(--text-secondary)] dark:text-muted" />
                </Field>
              </div>
              {/* Message Template */}
              <Field label="Mensaje con placeholders" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                {(id) => (
                  <>
                    <textarea id={id} value={campaignForm.messageTemplate} onChange={e => setCampaignForm(f => ({ ...f, messageTemplate: e.target.value }))} rows={4}
                      className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary resize-none font-mono"
                      placeholder="¡Hola {name}! Tenemos un {discount}% de descuento especial para ti..." />
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-1">Variables: {"{name}"}, {"{discount}"}, {"{code}"}</p>
                  </>
                )}
              </Field>
              {/* Discount Code */}
              <Field label="Código de descuento" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <input type="text" value={campaignForm.discountCode} onChange={e => setCampaignForm(f => ({ ...f, discountCode: e.target.value.toUpperCase() }))}
                  className="w-full mt-1 px-3 h-10 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary font-mono" placeholder="VERANO20" />
              </Field>
              {/* Auto-send toggle */}
              <div className="flex flex-wrap items-center gap-3 p-3 bg-[var(--surface-sunken)] rounded-xl">
                <input type="checkbox" id="autoSend" checked={campaignForm.autoSend} onChange={e => setCampaignForm(f => ({ ...f, autoSend: e.target.checked }))}
                  className="rounded border-[var(--rule-base)] text-primary focus:ring-primary" />
                <label htmlFor="autoSend" className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] cursor-pointer flex-1">
                  Enviar automáticamente al inicio de la campaña
                  <span className="block text-xs text-[var(--text-tertiary)] dark:text-muted font-normal">Las notificaciones se enviarán por WhatsApp al segmento seleccionado</span>
                </label>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex flex-wrap gap-3 shrink-0">
              <PrimaryButton variant="secondary" onClick={closeCampaignFormModal} className="flex-1">Cancelar</PrimaryButton>
              <PrimaryButton
                variant="primary"
                onClick={saveCampaign}
                disabled={!campaignForm.name.trim() || !campaignForm.startDate}
                loading={savingCampaign}
                className="flex-1"
              >
                {savingCampaign ? "Guardando" : editingCampaignId ? "Guardar cambios" : "Crear campaña"}
              </PrimaryButton>
            </div>
            <TiradorDeVentana ventana={ventanaCampaignForm} />
          </div>
        </div>
      )}
    </>
  );
}
