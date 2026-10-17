import { useCallback } from "react";
import { usePromocionesEstado } from "@/components/admin/promociones/hooks/use-promociones-estado";

/**
 * Cierre de las 7 ventanas. Parte de `usePromociones`. Foco, Escape, clic
 * afuera, scroll de atrás y ventana movible los pone `AdminModal` (11-10:
 * eran overlays a mano con su propio cableado).
 */
export function usePromocionesVentanas(previo: ReturnType<typeof usePromocionesEstado>) {
  const {
    setShowForm,
    setShowAiModal,
    setSendPromo,
    setConfirmDeleteId,
    setDetailPromo,
    setShowTemplates,
    setShowCampaignForm,
  } = previo;
  const closeFormModal = useCallback(() => setShowForm(false), [setShowForm]);
  const closeDetailModal = useCallback(() => setDetailPromo(null), [setDetailPromo]);
  const closeSendModal = useCallback(() => setSendPromo(null), [setSendPromo]);
  const closeAiModal = useCallback(() => setShowAiModal(false), [setShowAiModal]);
  const closeDeleteModal = useCallback(() => setConfirmDeleteId(null), [setConfirmDeleteId]);
  const closeTemplatesModal = useCallback(() => setShowTemplates(false), [setShowTemplates]);
  const closeCampaignFormModal = useCallback(
    () => setShowCampaignForm(false),
    [setShowCampaignForm],
  );
  return {
    closeFormModal,
    closeDetailModal,
    closeSendModal,
    closeAiModal,
    closeDeleteModal,
    closeTemplatesModal,
    closeCampaignFormModal,
  };
}
