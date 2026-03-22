"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const BusinessIntelligenceTab = dynamic(() => import("@/components/admin/BusinessIntelligenceTab"), { loading: S });
const HeatMapTab = dynamic(() => import("@/components/admin/HeatMapTab"), { loading: S });
const ABCAnalysisTab = dynamic(() => import("@/components/admin/ABCAnalysisTab"), { loading: S });
const ParetoAnalysisTab = dynamic(() => import("@/components/admin/ParetoAnalysisTab"), { loading: S });
const BCGMatrixTab = dynamic(() => import("@/components/admin/BCGMatrixTab"), { loading: S });
const BasketAnalysisTab = dynamic(() => import("@/components/admin/BasketAnalysisTab"), { loading: S });
const CustomKPITab = dynamic(() => import("@/components/admin/CustomKPITab"), { loading: S });

const TABS = [
  { id: "bi" as const, label: "Business Intelligence" },
  { id: "mapa-calor" as const, label: "Mapa de Calor" },
  { id: "abc" as const, label: "Análisis ABC" },
  { id: "pareto" as const, label: "Pareto" },
  { id: "bcg" as const, label: "Matriz BCG" },
  { id: "cesta" as const, label: "Análisis Cesta" },
  { id: "kpi" as const, label: "KPIs Personalizados" },
];

export default function AnalyticsBIModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none border-b border-gray-200 dark:border-card-border -mx-1 px-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`shrink-0 px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${
              sub === t.id
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "bi" && <BusinessIntelligenceTab />}
      {sub === "mapa-calor" && <HeatMapTab />}
      {sub === "abc" && <ABCAnalysisTab />}
      {sub === "pareto" && <ParetoAnalysisTab />}
      {sub === "bcg" && <BCGMatrixTab />}
      {sub === "cesta" && <BasketAnalysisTab />}
      {sub === "kpi" && <CustomKPITab />}
    </div>
  );
}
