"use client";

import dynamic from "next/dynamic";
import { Megaphone, Heart, Target, Gift, HeartHandshake, Repeat, Radio } from "@buleje/design-system/icons";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Hub de Crecimiento (centro de Marketing & Fidelización) ────────────────────
// Ola 1: Campañas (/api/campaigns) + Puntos (LoyaltyTab huérfana, montada).
// Ola 3: Segmentos accionables y Análisis RFM (consume /api/analytics/rfm).
// Ola 4 (2026-06-21): se ABSORBEN los 4 programas de crecimiento que vivían
//        enterrados como sub-tabs del Marketplace (Gift Cards, Socio Buleje,
//        Bodega al Mes/suscripciones, Lives).
// 11-10: «Segmentos» se funde en Campañas (su fila «Para quién»: los mismos
//        conteos y el mismo «crear campaña» en un toque); `?vista=segmentos`
//        cae ahí. «Análisis RFM» pasa a llamarse «Mejores clientes» y sus
//        grupos dejan de llamarse como los segmentos de Mis clientes.
const CampanasTab = dynamic(() => import("@/components/admin/MarketingAutomationTab"), { loading: S });
const LoyaltyTab  = dynamic(() => import("@/components/admin/LoyaltyTab"), { loading: S });
const RFMTab      = dynamic(() => import("@/components/admin/crecimiento/RFMTab"), { loading: S });
// Programas de crecimiento absorbidos desde MarketplaceModule (4→1, single home).
const GiftCardsAdminModule    = dynamic(() => import("@/components/admin/unified/GiftCardsAdminModule"), { loading: S });
const SocioMembersAdminModule = dynamic(() => import("@/components/admin/unified/SocioMembersAdminModule"), { loading: S });
const SubscriptionsModule     = dynamic(() => import("@/components/admin/unified/SubscriptionsModule"), { loading: S });
const LivesAdminModule        = dynamic(() => import("@/components/admin/unified/LivesAdminModule"), { loading: S });

const MODULE_ID = "crecimiento-hub";

// `shortLabel` = lo que se ve en la banda (siempre): con los nombres largos
// las 7 pestañas medían 841 px y al lado del título entran 719 (1280 px).
const TABS = [
  { id: "campanas",      label: "Campañas", icon: Megaphone },
  { id: "puntos",        label: "Puntos", icon: Heart },
  { id: "rfm",           label: "Mejores clientes", shortLabel: "Mejores", icon: Target },
  // ── Programas de crecimiento ──
  { id: "gift-cards",    label: "Tarjetas de regalo", shortLabel: "Regalo", icon: Gift },
  { id: "socio",         label: "Socio Buleje", shortLabel: "Socios", icon: HeartHandshake },
  { id: "subscriptions", label: "Bodega al Mes", shortLabel: "Al mes", icon: Repeat },
  { id: "lives",         label: "En Vivo", icon: Radio },
];

/** Los ids, estables: el hook los usa como dependencia. */
const TAB_IDS = TABS.map((t) => t.id);

/** Vistas fundidas: el link viejo llega a la que hoy lo cubre. */
const ALIAS = { segmentos: "campanas" } as const;

export default function CrecimientoHubModule({ initialTab }: { initialTab?: string } = {}) {
  // La sub-vista vive en `?vista=`: link compartible, atrás del navegador y
  // destino del buscador global. `initialTab` gana cuando el módulo se abre
  // desde un tab alias (ver useVistaModulo).
  const { vista: sub, irA: setSub } = useVistaModulo(MODULE_ID, TAB_IDS, TAB_IDS[0], initialTab, { alias: ALIAS });

  return (
    <div className="space-y-4">
      {/* El título va DENTRO de la barra de pestañas (patrón acordado con
          Brandon 2026-09-07): identidad a la izquierda, pestañas a la derecha,
          una sola regla. */}
      <AdminTabBar
        heading={{ title: "Crecimiento", description: "Campañas, puntos y programas para que el cliente vuelva.", icon: Megaphone }} tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "campanas" && <CampanasTab />}
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
