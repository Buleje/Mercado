"use client";

import { CardTitle } from "@buleje/design-system";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ABCAnalysisTab = dynamic(() => import("@/components/admin/ABCAnalysisTab"), { loading: S });
const ExpiryDashboardTab = dynamic(() => import("@/components/admin/ExpiryDashboardTab"), { loading: S });
const StockPredictionWidget = dynamic(() => import("@/components/admin/StockPredictionWidget"), { loading: S });
const SeasonalityInsights = dynamic(() => import("@/components/admin/SeasonalityInsights"), { loading: S });

export default function AnalisisDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <CardTitle className="text-sm font-bold text-[var(--text-secondary)] dark:text-muted mb-3">Análisis ABC</CardTitle>
        <ABCAnalysisTab />
      </div>
      <div className="border-t border-[var(--rule-base)] pt-6">
        <CardTitle className="text-sm font-bold text-[var(--text-secondary)] dark:text-muted mb-3">Control de Vencimientos</CardTitle>
        <ExpiryDashboardTab />
      </div>
      <div className="border-t border-[var(--rule-base)] pt-6">
        <CardTitle className="text-sm font-bold text-[var(--text-secondary)] dark:text-muted mb-3">Predicción de Stock</CardTitle>
        <StockPredictionWidget />
      </div>
      <div className="border-t border-[var(--rule-base)] pt-6">
        <CardTitle className="text-sm font-bold text-[var(--text-secondary)] dark:text-muted mb-3">Estacionalidad</CardTitle>
        <SeasonalityInsights />
      </div>
    </div>
  );
}
