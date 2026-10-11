"use client";

import dynamic from "next/dynamic";
import { BarChart3, TrendingUp, BellRing } from "@buleje/design-system/icons";
import { useVistaModulo, type ParamsDeVista } from "@/hooks/use-vista-modulo";
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

// 11-10: rótulos en su idioma («Analytics Pro» → Métricas) y la vista
// «inteligencia» pasa a ser Alertas: lo demás que mostraba estaba repetido en
// Mi Plata, Compras, Métricas y Predicción (ver analisis/InteligenciaTab.tsx).
// Los ids no cambian: los enlaces guardados siguen abriendo lo mismo.
const TABS = [
  { id: "analytics",    label: "Métricas",   icon: BarChart3 },
  { id: "forecast",     label: "Predicción", icon: TrendingUp },
  { id: "inteligencia", label: "Alertas",    icon: BellRing },
];

/** Los ids, estables: el hook los usa como dependencia. */
const TAB_IDS = TABS.map((t) => t.id);
type Vista = "analytics" | "forecast" | "inteligencia";

/** Métricas y Alertas recuerdan su sección en `?sub=`: al cambiar de vista no viaja a la otra. */
const PARAMS_DE_VISTA: ParamsDeVista<Vista> = { analytics: ["sub"], inteligencia: ["sub"] };

export default function AnalisisHubModule({ initialTab }: { initialTab?: string } = {}) {
  // La sub-vista vive en `?vista=`: así se comparte por link, el botón «atrás»
  // la recorre y el buscador global puede mandar directo acá. `initialTab` gana
  // cuando el módulo se abre desde un tab alias (ver useVistaModulo).
  const { vista: sub, irA: setSub } = useVistaModulo<Vista>(MODULE_ID, TAB_IDS as Vista[], "analytics", initialTab, { paramsDeVista: PARAMS_DE_VISTA });

  return (
    <div className="space-y-4">
      {/* El título va DENTRO de la barra de pestañas, no encima.
          Medido a 1363x677 (laptop con el chrome del navegador puesto): el
          apilado título → regla → pestañas → subtítulo → regla → pestañas
          gastaba 232px hasta el primer número, el 34% de la pantalla. Y el
          «eyebrow» decía «Análisis · Negocio» arriba de un título «Análisis»:
          la misma palabra dos veces.
          El subtítulo de segundo nivel se fue por lo mismo — ver AnalyticsBIModule. */}
      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
        heading={{
          title: "Análisis",
          description: "Las cifras del negocio en gráficos, lo que se viene y lo que hay que revisar.",
          icon: BarChart3,
        }}
      >
        {sub === "analytics" && <AnalyticsProModule />}
        {sub === "forecast" && <ForecastingDashboard />}
        {sub === "inteligencia" && <InteligenciaTab />}
      </AdminTabBar>
    </div>
  );
}
