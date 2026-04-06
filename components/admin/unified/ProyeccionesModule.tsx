"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { TrendingUp, Sliders, Sun, GitCompare } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminDateFilter from "@/components/admin/shared/AdminDateFilter";
import type { DatePreset } from "@/components/admin/shared/AdminDateFilter";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ScenarioSimulatorTab = dynamic(() => import("@/components/admin/ScenarioSimulatorTab"), { loading: S });
const SeasonalityTab = dynamic(() => import("@/components/admin/SeasonalityTab"), { loading: S });
const PeriodComparatorTab = dynamic(() => import("@/components/admin/PeriodComparatorTab"), { loading: S });

const MODULE_ID = "proyecciones";

const TABS = [
  { id: "simulador", label: "Simulador", icon: Sliders },
  { id: "estacionalidad", label: "Estacionalidad", icon: Sun },
  { id: "comparador", label: "Comparador", icon: GitCompare },
];

export default function ProyeccionesModule() {
  const [sub, setSub] = useState(TABS[0].id);
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Proyecciones"
        description="Simulador de escenarios, estacionalidad y comparador de periodos"
        icon={TrendingUp}
      >
        <AdminDateFilter value={datePreset} onChange={setDatePreset} />
      </AdminModuleHeader>

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      />

      {sub === "simulador" && <ScenarioSimulatorTab />}
      {sub === "estacionalidad" && <SeasonalityTab />}
      {sub === "comparador" && <PeriodComparatorTab />}
    </div>
  );
}
