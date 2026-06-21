"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Megaphone, Heart, Users, Target, Gift, HeartHandshake, Repeat, Radio } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Hub de Crecimiento (centro de Marketing & Fidelización) ────────────────────
// Ola 1: Campañas (/api/campaigns) + Puntos (LoyaltyTab huérfana, montada).
// Ola 3: Segmentos accionables (conteo en vivo + crear campaña en 1 clic) y
//        Análisis RFM (consume /api/analytics/rfm, antes sin UI).
// Ola 4 (2026-06-21): se ABSORBEN los 4 programas de crecimiento que vivían
//        enterrados como sub-tabs del Marketplace (Gift Cards, Socio Buleje,
//        Bodega al Mes/suscripciones, Lives). Ahora todo lo que hace VOLVER al
//        cliente vive en UN solo hub potente, visible en el sidebar.
const CampanasTab = dynamic(() => import("@/components/admin/MarketingAutomationTab"), { loading: S });
const LoyaltyTab  = dynamic(() => import("@/components/admin/LoyaltyTab"), { loading: S });
const SegmentsTab = dynamic(() => import("@/components/admin/crecimiento/SegmentsTab"), { loading: S });
const RFMTab      = dynamic(() => import("@/components/admin/crecimiento/RFMTab"), { loading: S });
// Programas de crecimiento absorbidos desde MarketplaceModule (4→1, single home).
const GiftCardsAdminModule    = dynamic(() => import("@/components/admin/unified/GiftCardsAdminModule"), { loading: S });
const SocioMembersAdminModule = dynamic(() => import("@/components/admin/unified/SocioMembersAdminModule"), { loading: S });
const SubscriptionsModule     = dynamic(() => import("@/components/admin/unified/SubscriptionsModule"), { loading: S });
const LivesAdminModule        = dynamic(() => import("@/components/admin/unified/LivesAdminModule"), { loading: S });

const MODULE_ID = "crecimiento-hub";

const TABS = [
  { id: "campanas",      label: "Campañas", icon: Megaphone },
  { id: "segmentos",     label: "Segmentos", icon: Users },
  { id: "puntos",        label: "Puntos & Fidelización", icon: Heart },
  { id: "rfm",           label: "Análisis RFM", icon: Target },
  // ── Programas de crecimiento ──
  { id: "gift-cards",    label: "Gift Cards", icon: Gift },
  { id: "socio",         label: "Socio Buleje", icon: HeartHandshake },
  { id: "subscriptions", label: "Bodega al Mes", icon: Repeat },
  { id: "lives",         label: "En Vivo", icon: Radio },
];

export default function CrecimientoHubModule({ initialTab }: { initialTab?: string } = {}) {
  const [sub, setSub] = useState(() => {
    if (initialTab) return initialTab;
    if (typeof window === "undefined") return TABS[0].id;
    return localStorage.getItem(`admin-last-tab-${MODULE_ID}`) || TABS[0].id;
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);

  // Cross-tab: "Segmentos" → abre "Campañas" con el segmento pre-cargado.
  const [campaignSegment, setCampaignSegment] = useState<string | null>(null);
  const goCreateCampaign = useCallback((segment: string) => {
    setCampaignSegment(segment);
    setSub("campanas");
  }, []);
  const consumeSegment = useCallback(() => setCampaignSegment(null), []);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        eyebrow="Marketing & Fidelización"
        title="Crecimiento"
        description="Todo lo que hace volver a tus clientes en un solo lugar: campañas segmentadas, puntos, RFM, gift cards, Socio Buleje, suscripciones y lives."
        icon={Megaphone}
      />
      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "campanas" && <CampanasTab initialSegment={campaignSegment} onConsumeSegment={consumeSegment} />}
        {sub === "segmentos" && <SegmentsTab onCreateCampaign={goCreateCampaign} />}
        {sub === "puntos" && <LoyaltyTab />}
        {sub === "rfm" && <RFMTab />}
        {sub === "gift-cards" && <GiftCardsAdminModule />}
        {sub === "socio" && <SocioMembersAdminModule />}
        {sub === "subscriptions" && <SubscriptionsModule />}
        {sub === "lives" && <LivesAdminModule />}
      </AdminTabBar>
    </div>
  );
}
