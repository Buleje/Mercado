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

export type AnalyticsPeriod = "1d" | "7d" | "30d" | "90d" | "1y";

const PERIODS: { key: AnalyticsPeriod; label: string }[] = [
  { key: "1d",  label: "Hoy" },
  { key: "7d",  label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "90d", label: "90 días" },
  { key: "1y",  label: "1 año" },
];

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
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 dark:text-muted mr-1">Periodo:</span>
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold border transition-colors ${
              period === p.key
                ? "text-white border-transparent"
                : "border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
            }`}
            style={period === p.key ? { backgroundColor: "#2d6a4f" } : undefined}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Sub-tabs */}
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

      {/* Tab content — period passed as prop for future consumption */}
      {sub === "bi" && <BusinessIntelligenceTab period={period} />}
      {sub === "mapa-calor" && <HeatMapTab period={period} />}
      {sub === "abc" && <ABCAnalysisTab period={period} />}
      {sub === "pareto" && <ParetoAnalysisTab period={period} />}
      {sub === "bcg" && <BCGMatrixTab period={period} />}
      {sub === "cesta" && <BasketAnalysisTab period={period} />}
      {sub === "kpi" && <CustomKPITab period={period} />}
    </div>
  );
}
