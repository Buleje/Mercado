"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { BarChart3, TrendingUp, Sparkles } from "@buleje/design-system/icons";
import AdminBreadcrumb from "@/components/admin/shared/AdminBreadcrumb";
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

export default function AnalisisHubModule({ initialTab }: { initialTab?: string } = {}) {
  const [sub, setSub] = useState(() => {
    if (initialTab) return initialTab;
    if (typeof window === "undefined") return TABS[0].id;
    return localStorage.getItem(`admin-last-tab-${MODULE_ID}`) || TABS[0].id;
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);

  return (
    <div className="space-y-4">
      <AdminBreadcrumb
        items={[
          { label: "Análisis", onClick: () => setSub(TABS[0].id) },
          { label: TABS.find((t) => t.id === sub)?.label ?? "" },
        ]}
      />
      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "analytics" && <AnalyticsProModule />}
        {sub === "forecast" && <ForecastingDashboard />}
        {sub === "inteligencia" && <InteligenciaTab />}
      </AdminTabBar>
    </div>
  );
}
