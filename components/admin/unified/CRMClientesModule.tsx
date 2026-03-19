"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const CRMTab = dynamic(() => import("@/components/admin/CRMTab"), { loading: S });
const Customer360Tab = dynamic(() => import("@/components/admin/Customer360Tab"), { loading: S });
const CustomerSegmentationTab = dynamic(() => import("@/components/admin/CustomerSegmentationTab"), { loading: S });
const AutoSegmentsTab = dynamic(() => import("@/components/admin/AutoSegmentsTab"), { loading: S });
const CLVAnalyticsTab = dynamic(() => import("@/components/admin/CLVAnalyticsTab"), { loading: S });

const TABS = [
  { id: "crm" as const, label: "CRM" },
  { id: "vista-360" as const, label: "Vista 360°" },
  { id: "segmentacion" as const, label: "Segmentación" },
  { id: "segmentos-auto" as const, label: "Segmentos Auto" },
  { id: "clv" as const, label: "CLV / Cohortes" },
];

export default function CRMClientesModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-6">
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-card-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${
              sub === t.id
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "crm" && <CRMTab />}
      {sub === "vista-360" && <Customer360Tab />}
      {sub === "segmentacion" && <CustomerSegmentationTab />}
      {sub === "segmentos-auto" && <AutoSegmentsTab />}
      {sub === "clv" && <CLVAnalyticsTab />}
    </div>
  );
}
