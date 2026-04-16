"use client";

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
        <h3 className="text-sm font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-3">Análisis ABC</h3>
        <ABCAnalysisTab />
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h3 className="text-sm font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-3">Control de Vencimientos</h3>
        <ExpiryDashboardTab />
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h3 className="text-sm font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-3">Predicción de Stock</h3>
        <StockPredictionWidget />
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h3 className="text-sm font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-3">Estacionalidad</h3>
        <SeasonalityInsights />
      </div>
    </div>
  );
}
