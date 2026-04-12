"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { RefreshCw, RotateCw, Zap, BrainCircuit } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const AutoReorderTab = dynamic(() => import("@/components/admin/AutoReorderTab"), { loading: S });
const DynamicReorderTab = dynamic(() => import("@/components/admin/DynamicReorderTab"), { loading: S });
const DemandPredictionTab = dynamic(() => import("@/components/admin/DemandPredictionTab"), { loading: S });

const MODULE_ID = "reposicion";

const TABS = [
  { id: "auto", label: "Auto-Reorden", icon: RotateCw },
  { id: "dinamico", label: "Reorden Dinámico", icon: Zap },
  { id: "prediccion", label: "Predicción IA", icon: BrainCircuit },
];

export default function ReposicionModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Reposición"
        description="Auto-reorden, reorden dinámico y predicción de demanda con IA"
        icon={RefreshCw}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {sub === "auto" && <AutoReorderTab />}
        {sub === "dinamico" && <DynamicReorderTab />}
        {sub === "prediccion" && <DemandPredictionTab />}
      </AdminTabBar>
    </div>
  );
}
