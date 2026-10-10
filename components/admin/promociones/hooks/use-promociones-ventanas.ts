import { useCallback, useId, useRef } from "react";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { usePromocionesEstado } from "@/components/admin/promociones/hooks/use-promociones-estado";

/** Accesibilidad, scroll y ventana movible de las 7 ventanas. Parte de `usePromociones`. */
export function usePromocionesVentanas(previo: ReturnType<typeof usePromocionesEstado>) {
  const {
    showForm, setShowForm, showAiModal, setShowAiModal, sendPromo, setSendPromo, confirmDeleteId,
    setConfirmDeleteId, detailPromo, setDetailPromo, showTemplates, setShowTemplates, showCampaignForm,
    setShowCampaignForm,
  } = previo;
  useScrollLock(showForm || showAiModal || !!sendPromo || !!confirmDeleteId || !!detailPromo || showTemplates || showCampaignForm);

  // A11y: los 7 modales de este tab son overlays a mano sin rol de diálogo
  // ni trampa de foco/Escape — cableado mínimo con el hook compartido.
  const formModalRef = useRef<HTMLDivElement>(null);
  const formTitleId = useId();
  const closeFormModal = useCallback(() => setShowForm(false), [setShowForm]);
  useModalAccesible(formModalRef, { onCerrar: closeFormModal, activo: showForm });
  const ventanaForm = useVentanaDeModal(showForm, { ref: formModalRef, aplicarTranslate: true, claveMemoria: "promociones-form" });

  const detailModalRef = useRef<HTMLDivElement>(null);
  const detailTitleId = useId();
  const closeDetailModal = useCallback(() => setDetailPromo(null), [setDetailPromo]);
  useModalAccesible(detailModalRef, { onCerrar: closeDetailModal, activo: !!detailPromo });
  const ventanaDetail = useVentanaDeModal(!!detailPromo, { ref: detailModalRef, aplicarTranslate: true, claveMemoria: "promociones-detalle" });

  const sendModalRef = useRef<HTMLDivElement>(null);
  const sendTitleId = useId();
  const closeSendModal = useCallback(() => setSendPromo(null), [setSendPromo]);
  useModalAccesible(sendModalRef, { onCerrar: closeSendModal, activo: !!sendPromo });
  const ventanaSend = useVentanaDeModal(!!sendPromo, { ref: sendModalRef, aplicarTranslate: true, claveMemoria: "promociones-enviar" });

  const aiModalRef = useRef<HTMLDivElement>(null);
  const aiTitleId = useId();
  const closeAiModal = useCallback(() => setShowAiModal(false), [setShowAiModal]);
  useModalAccesible(aiModalRef, { onCerrar: closeAiModal, activo: showAiModal });
  const ventanaAi = useVentanaDeModal(showAiModal, { ref: aiModalRef, aplicarTranslate: true, claveMemoria: "promociones-ia" });

  const deleteModalRef = useRef<HTMLDivElement>(null);
  const deleteTitleId = useId();
  const closeDeleteModal = useCallback(() => setConfirmDeleteId(null), [setConfirmDeleteId]);
  useModalAccesible(deleteModalRef, { onCerrar: closeDeleteModal, activo: !!confirmDeleteId });

  const templatesModalRef = useRef<HTMLDivElement>(null);
  const templatesTitleId = useId();
  const closeTemplatesModal = useCallback(() => setShowTemplates(false), [setShowTemplates]);
  useModalAccesible(templatesModalRef, { onCerrar: closeTemplatesModal, activo: showTemplates });
  const ventanaTemplates = useVentanaDeModal(showTemplates, { ref: templatesModalRef, aplicarTranslate: true, claveMemoria: "promociones-plantillas" });

  const campaignFormModalRef = useRef<HTMLDivElement>(null);
  const campaignFormTitleId = useId();
  const closeCampaignFormModal = useCallback(() => setShowCampaignForm(false), [setShowCampaignForm]);
  useModalAccesible(campaignFormModalRef, { onCerrar: closeCampaignFormModal, activo: showCampaignForm });
  const ventanaCampaignForm = useVentanaDeModal(showCampaignForm, { ref: campaignFormModalRef, aplicarTranslate: true, claveMemoria: "promociones-campana-form" });
  return {
    formModalRef, formTitleId, closeFormModal, ventanaForm, detailModalRef, detailTitleId,
    closeDetailModal, ventanaDetail, sendModalRef, sendTitleId, closeSendModal, ventanaSend,
    aiModalRef, aiTitleId, closeAiModal, ventanaAi, deleteModalRef, deleteTitleId, closeDeleteModal,
    templatesModalRef, templatesTitleId, closeTemplatesModal, ventanaTemplates, campaignFormModalRef,
    campaignFormTitleId, closeCampaignFormModal, ventanaCampaignForm,
  };
}
