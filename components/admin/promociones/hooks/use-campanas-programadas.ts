import { csrfHeaders } from "@/lib/csrf-client";
import { type ScheduledCampaign, emptyCampaign } from "@/components/admin/promociones/promociones-compartido";
import { usePromocionesEstado } from "@/components/admin/promociones/hooks/use-promociones-estado";
import { usePromocionesVentanas } from "@/components/admin/promociones/hooks/use-promociones-ventanas";
import { usePromocionesCarga } from "@/components/admin/promociones/hooks/use-promociones-carga";

/** Campañas programadas (guardadas en este navegador) y su envío. Parte de `usePromociones`. */
export function useCampanasProgramadas(previo: ReturnType<typeof usePromocionesEstado> & ReturnType<typeof usePromocionesVentanas> & ReturnType<typeof usePromocionesCarga>) {
  const {
    confirm, customers, setCampaigns, setShowCampaignForm, editingCampaignId, setEditingCampaignId,
    campaignForm, setCampaignForm, setSavingCampaign, setSendingCampaignId, setCampaignFeedback,
  } = previo;
  // ── Scheduled Campaigns ────────────────────────────────────────────────
  const openCreateCampaign = () => {
    setCampaignForm(emptyCampaign);
    setEditingCampaignId(null);
    setShowCampaignForm(true);
  };

  const openEditCampaign = (c: ScheduledCampaign) => {
    setCampaignForm({
      name: c.name,
      description: c.description,
      targetSegment: c.targetSegment,
      startDate: c.startDate,
      endDate: c.endDate,
      messageTemplate: c.messageTemplate,
      discountCode: c.discountCode,
      autoSend: c.autoSend,
    });
    setEditingCampaignId(c.id);
    setShowCampaignForm(true);
  };

  const saveCampaign = () => {
    if (!campaignForm.name.trim() || !campaignForm.startDate) return;
    setSavingCampaign(true);

    const now = new Date().toISOString();
    const startDate = new Date(campaignForm.startDate).toISOString();
    const endDate = campaignForm.endDate ? new Date(campaignForm.endDate).toISOString() : "";

    let status: ScheduledCampaign["status"] = "scheduled";
    if (startDate <= now && (!endDate || endDate >= now)) status = "active";
    else if (endDate && endDate < now) status = "completed";

    if (editingCampaignId) {
      setCampaigns(prev => prev.map(c => c.id === editingCampaignId ? {
        ...c,
        name: campaignForm.name.trim(),
        description: campaignForm.description.trim(),
        targetSegment: campaignForm.targetSegment,
        startDate,
        endDate,
        messageTemplate: campaignForm.messageTemplate.trim(),
        discountCode: campaignForm.discountCode.trim(),
        autoSend: campaignForm.autoSend,
        status,
      } : c));
    } else {
      const newCampaign: ScheduledCampaign = {
        id: `camp-${Date.now()}`,
        name: campaignForm.name.trim(),
        description: campaignForm.description.trim(),
        targetSegment: campaignForm.targetSegment,
        startDate,
        endDate,
        messageTemplate: campaignForm.messageTemplate.trim(),
        discountCode: campaignForm.discountCode.trim(),
        autoSend: campaignForm.autoSend,
        status,
        createdAt: now,
      };
      setCampaigns(prev => [newCampaign, ...prev]);
    }

    setShowCampaignForm(false);
    setSavingCampaign(false);
  };

  const toggleCampaignStatus = (id: string) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== id) return c;
      if (c.status === "paused") {
        // Resume: check dates to determine if active or scheduled
        const now = new Date().toISOString();
        const newStatus = c.startDate <= now && (!c.endDate || c.endDate >= now) ? "active" : "scheduled";
        return { ...c, status: newStatus };
      } else if (c.status === "active" || c.status === "scheduled") {
        return { ...c, status: "paused" };
      }
      return c;
    }));
  };

  const deleteCampaign = async (id: string) => {
    if (await confirm({
      title: "¿Eliminar campaña programada?",
      intent: "danger",
      confirmLabel: "Sí, eliminar",
    })) {
      setCampaigns(prev => prev.filter(c => c.id !== id));
    }
  };

  // Resuelve los teléfonos del segmento (best-effort con los datos del cliente
  // que ya tenemos). El backend filtra además por consentimiento (notifPromotions).
  const segmentPhones = (segment: string): string[] => {
    const s = (segment || "all").toLowerCase();
    let list = customers;
    if (s === "loyal" || s === "champions" || s === "vip") {
      list = customers.filter(c => ["oro", "diamante"].includes((c.loyaltyTier || "").toLowerCase()));
    } else if (s === "deudores") {
      list = customers.filter(c => (c.creditBalance ?? 0) < 0);
    }
    // all / at-risk / lost / new / promising → todos (segmentación fina vive en Crecimiento → Campañas)
    return list.map(c => c.phone).filter(Boolean);
  };

  const sendCampaignNow = async (c: ScheduledCampaign) => {
    const phones = segmentPhones(c.targetSegment);
    if (phones.length === 0) {
      setCampaignFeedback({ id: c.id, text: "No hay clientes en ese segmento.", ok: false });
      return;
    }
    setSendingCampaignId(c.id);
    setCampaignFeedback(null);
    try {
      const message = c.discountCode && !c.messageTemplate.includes(c.discountCode)
        ? `${c.messageTemplate}\n\nCódigo: ${c.discountCode}`
        : c.messageTemplate;
      const res = await fetch("/api/campaigns/notify", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ phones, title: c.name, message }),
      });
      if (res.ok) {
        const data = await res.json();
        setCampaignFeedback({
          id: c.id,
          text: `Enviado a ${data.sent} cliente${data.sent === 1 ? "" : "s"} (notificación en la app).${data.skipped ? ` ${data.skipped} sin permiso de promociones.` : ""}`,
          ok: true,
        });
      } else {
        setCampaignFeedback({ id: c.id, text: "No se pudo enviar la campaña.", ok: false });
      }
    } catch {
      setCampaignFeedback({ id: c.id, text: "Error de red al enviar.", ok: false });
    } finally {
      setSendingCampaignId(null);
    }
  };
  return {
    openCreateCampaign, openEditCampaign, saveCampaign, toggleCampaignStatus, deleteCampaign,
    segmentPhones, sendCampaignNow,
  };
}
