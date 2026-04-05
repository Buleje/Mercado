"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { LayoutDashboard, BarChart3 } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminDateFilter from "@/components/admin/shared/AdminDateFilter";
import type { DatePreset } from "@/components/admin/shared/AdminDateFilter";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const DashboardTab = dynamic(() => import("@/components/admin/DashboardTab"), { loading: S });
const ExecutiveDashboardTab = dynamic(() => import("@/components/admin/ExecutiveDashboardTab"), { loading: S });

const MODULE_ID = "panel-principal";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "ejecutivo", label: "Ejecutivo", icon: BarChart3 },
];

export default function PanelPrincipalModule() {
  const [sub, setSub] = useState(TABS[0].id);
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Panel Principal"
        description="Vista general del negocio y métricas clave"
        icon={LayoutDashboard}
      >
        <AdminDateFilter value={datePreset} onChange={setDatePreset} />
      </AdminModuleHeader>

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      />

      {sub === "dashboard" && <DashboardTab />}
      {sub === "ejecutivo" && <ExecutiveDashboardTab />}
    </div>
  );
}
