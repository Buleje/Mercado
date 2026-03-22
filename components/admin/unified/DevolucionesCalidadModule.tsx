"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ReturnsTab = dynamic(() => import("@/components/admin/ReturnsTab"), { loading: S });
const AdvancedReturnsTab = dynamic(() => import("@/components/admin/AdvancedReturnsTab"), { loading: S });
const QualityControlTab = dynamic(() => import("@/components/admin/QualityControlTab"), { loading: S });
const AnomalyDetectionTab = dynamic(() => import("@/components/admin/AnomalyDetectionTab"), { loading: S });

const TABS = [
  { id: "devoluciones" as const, label: "Devoluciones" },
  { id: "avanzadas" as const, label: "Avanzadas" },
  { id: "calidad" as const, label: "Control Calidad" },
  { id: "anomalias" as const, label: "Anomalías" },
];

export default function DevolucionesCalidadModule() {
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
      {sub === "devoluciones" && <ReturnsTab />}
      {sub === "avanzadas" && <AdvancedReturnsTab />}
      {sub === "calidad" && <QualityControlTab />}
      {sub === "anomalias" && <AnomalyDetectionTab />}
    </div>
  );
}
