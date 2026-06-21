"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Megaphone, Heart, Users, Target } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Hub de Crecimiento ────────────────────────────────────────────────────────
// Ola 1: Campañas (/api/campaigns) + Puntos (LoyaltyTab huérfana, montada).
// Ola 3: Segmentos accionables (conteo en vivo + crear campaña en 1 clic) y
//        Análisis RFM (consume /api/analytics/rfm, antes sin UI).
const CampanasTab = dynamic(() => import("@/components/admin/MarketingAutomationTab"), { loading: S });
const LoyaltyTab  = dynamic(() => import("@/components/admin/LoyaltyTab"), { loading: S });
const SegmentsTab = dynamic(() => import("@/components/admin/crecimiento/SegmentsTab"), { loading: S });
const RFMTab      = dynamic(() => import("@/components/admin/crecimiento/RFMTab"), { loading: S });

const MODULE_ID = "crecimiento-hub";

const TABS = [
  { id: "campanas",  label: "Campañas", icon: Megaphone },
  { id: "segmentos", label: "Segmentos", icon: Users },
  { id: "puntos",    label: "Puntos & Fidelización", icon: Heart },
  { id: "rfm",       label: "Análisis RFM", icon: Target },
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
        eyebrow="Operaciones · Crecimiento"
        title="Crecimiento"
        description="Haz que tus clientes vuelvan: campañas segmentadas, programa de puntos y análisis de comportamiento."
        icon={Megaphone}
      />
      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "campanas" && <CampanasTab initialSegment={campaignSegment} onConsumeSegment={consumeSegment} />}
        {sub === "segmentos" && <SegmentsTab onCreateCampaign={goCreateCampaign} />}
        {sub === "puntos" && <LoyaltyTab />}
        {sub === "rfm" && <RFMTab />}
      </AdminTabBar>
    </div>
  );
}
