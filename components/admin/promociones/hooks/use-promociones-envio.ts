import { useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DbPromotion } from "@/lib/jsondb";
import { formatCurrency } from "@/lib/format";
import { applyStoreName } from "@/components/admin/promociones/promociones-compartido";
import { usePromocionesEstado } from "@/components/admin/promociones/hooks/use-promociones-estado";
import { usePromocionesVentanas } from "@/components/admin/promociones/hooks/use-promociones-ventanas";
import { usePromocionesCarga } from "@/components/admin/promociones/hooks/use-promociones-carga";
import { useCampanasProgramadas } from "@/components/admin/promociones/hooks/use-campanas-programadas";

/** Sugerencias de IA, envío por WhatsApp e indicadores estimados. Parte de `usePromociones`. */
export function usePromocionesEnvio(previo: ReturnType<typeof usePromocionesEstado> & ReturnType<typeof usePromocionesVentanas> & ReturnType<typeof usePromocionesCarga> & ReturnType<typeof useCampanasProgramadas>) {
  const {
    notice, storeName, promos, customers, customerSearch, setShowAiModal, setAiSuggestions, setAiError,
    setLoadingAi, aiContext, sendPromo, setSendPromo, sendPhones, setSendPhones, sendSearch,
    setSendSearch,
  } = previo;
  // ── AI Suggestions ─────────────────────────────────────────────────────────
  const requestAiSuggestions = async () => {
    setLoadingAi(true);
    setAiSuggestions(null);
    setAiError(false);
    setShowAiModal(true);
    try {
      const r = await fetch("/api/promotions/ai-suggest", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ context: aiContext }),
      });
      const data = await r.json();
      if (data.error) { setAiError(true); setAiSuggestions(data.error); }
      else setAiSuggestions(data.suggestions);
    } catch { setAiError(true); setAiSuggestions("Error al conectar con el servicio de IA."); }
    setLoadingAi(false);
  };

  // ── WhatsApp Send ──────────────────────────────────────────────────────────
  const openSendModal = (p: DbPromotion) => {
    setSendPromo(p);
    // Pre-select target phones if configured
    const preSelected = p.targetPhones ? new Set(p.targetPhones.split(",").filter(Boolean)) : new Set<string>();
    if (p.targetType === "all") {
      setSendPhones(new Set(customers.map(c => c.phone)));
    } else {
      setSendPhones(preSelected);
    }
    setSendSearch("");
  };

  const sendWhatsApp = (phone: string, message: string) => {
    const digits = phone.replace(/\D/g, "");
    const fullPhone = digits.length === 9 ? `51${digits}` : digits;
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${fullPhone}?text=${encoded}`, "_blank");
  };

  const sendToAll = async () => {
    if (!sendPromo) return;
    const rawMsg = sendPromo.message || `🎉 *${sendPromo.name}*\n\n${sendPromo.description}\n\n${sendPromo.discountPercent > 0 ? `📢 ${sendPromo.discountPercent}% de descuento` : ""}${sendPromo.minPurchase ? `\nCompra mínima: ${formatCurrency(sendPromo.minPurchase)}` : ""}\n\n¡Te esperamos en {TIENDA}! 🛒`;
    const msg = applyStoreName(rawMsg, storeName);
    const phones = Array.from(sendPhones);
    if (phones.length === 0) return;

    // Create in-app notifications for all selected customers (fire-and-forget)
    fetch("/api/campaigns/notify", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ phones, title: sendPromo.name, message: sendPromo.description || msg, promoId: sendPromo.id }),
    }).catch((err) => console.warn("[PromotionsTab] campaigns/notify POST failed:", err));

    // Open first WhatsApp link
    sendWhatsApp(phones[0], msg);
    if (phones.length > 1) {
      await notice({
        title: `Se abrió WhatsApp para ${phones[0]}`,
        description: `Se crearon ${phones.length} notificaciones in-app. Quedan ${phones.length - 1} clientes más por WhatsApp: haz clic en cada botón "Enviar" para enviarles individualmente.`,
        intent: "info",
      });
    }
  };

  const filteredSendCustomers = customers.filter(c => {
    const q = sendSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const filteredFormCustomers = customers.filter(c => {
    const q = customerSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const active = promos.filter(p => p.active);
  const inactive = promos.filter(p => !p.active);

  // ── Mejora 13: Métricas de rendimiento de promociones ──────────────────
  const [nowTs] = useState(() => Date.now());
  const promoMetrics = promos.map(p => {
    // Estimar usos basándonos en descuento y actividad
    const daysSinceCreated = Math.max(1, Math.floor((nowTs - new Date(p.createdAt).getTime()) / 86400000));
    const estimatedUses = p.active ? Math.min(daysSinceCreated * 2, 50) : Math.min(daysSinceCreated, 10);
    const estimatedRevenue = estimatedUses * (p.minPurchase || 50);
    const avgTicketWithPromo = p.minPurchase ? p.minPurchase * 1.3 : 65;
    const avgTicketWithout = 45;
    return { ...p, estimatedUses, estimatedRevenue, avgTicketWithPromo, avgTicketWithout };
  });

  const topPromo = promoMetrics.reduce((best, p) => p.estimatedUses > (best?.estimatedUses ?? 0) ? p : best, promoMetrics[0]);

  const totalUses = promoMetrics.reduce((s, p) => s + p.estimatedUses, 0);
  const totalRevenue = promoMetrics.reduce((s, p) => s + p.estimatedRevenue, 0);
  return {
    requestAiSuggestions, openSendModal, sendWhatsApp, sendToAll, filteredSendCustomers,
    filteredFormCustomers, active, inactive, nowTs, promoMetrics, topPromo, totalUses, totalRevenue,
  };
}
