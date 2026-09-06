"use client";

import dynamic from "next/dynamic";
import { BarChart3, TrendingUp, Sparkles } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Hub de Análisis (consolidación 2→1) ──────────────────────────────────────
// Antes: 2 entradas top-level (analytics-pro, forecasting). Ahora 1 centro de
// análisis con 2 sub-tabs. El header "Análisis" se muestra SIEMPRE arriba
// (coherencia admin, Brandon 2026-06-19); cada módulo conserva su sub-header
// debajo. Rendimiento técnico queda aparte (no es análisis de negocio).
const AnalyticsProModule  = dynamic(() => import("@/components/admin/unified/AnalyticsProModule"),        { loading: S, ssr: false });
const ForecastingDashboard = dynamic(() => import("@/components/admin/forecasting/ForecastingDashboard"), { loading: S });
// Inteligencia de negocio — movida desde FinanzasModule (BI operacional, no financiero)
const InteligenciaTab = dynamic(() => import("@/components/admin/analisis/InteligenciaTab"), { loading: S });

const MODULE_ID = "analisis-hub";

const TABS = [
  { id: "analytics",    label: "Analytics Pro",      icon: BarChart3 },
  { id: "forecast",     label: "Predicción Demanda", icon: TrendingUp },
  { id: "inteligencia", label: "Inteligencia",       icon: Sparkles },
];

/** Los ids, estables: el hook los usa como dependencia. */
const TAB_IDS = TABS.map((t) => t.id);

export default function AnalisisHubModule({ initialTab }: { initialTab?: string } = {}) {
  // La sub-vista vive en `?vista=`: así se comparte por link, el botón «atrás»
  // la recorre y el buscador global puede mandar directo acá. `initialTab` gana
  // cuando el módulo se abre desde un tab alias (ver useVistaModulo).
  const { vista: sub, irA: setSub } = useVistaModulo(MODULE_ID, TAB_IDS, TAB_IDS[0], initialTab);

  return (
    <div className="space-y-4">
      {/* Header ARRIBA de las pestañas, igual que Mi Plata. Sin él, la primera
          cosa de la pantalla era la barra de sub-tabs y el título aparecía
          debajo — al revés que el resto del panel. (El breadcrumb que había
          antes decía «Análisis › Analytics Pro» encima de una barra donde
          «Analytics Pro» ya está marcada: dos líneas para el mismo dato.) */}
      <AdminModuleHeader
        eyebrow="Análisis · Negocio"
        title="Análisis"
        description="Métricas del negocio, predicción de demanda e inteligencia comercial."
        icon={BarChart3}
      />
      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "analytics" && <AnalyticsProModule />}
        {sub === "forecast" && <ForecastingDashboard />}
        {sub === "inteligencia" && <InteligenciaTab />}
      </AdminTabBar>
    </div>
  );
}
