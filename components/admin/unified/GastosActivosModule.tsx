"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Receipt, Wallet, Shield, Building2 } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminDateFilter from "@/components/admin/shared/AdminDateFilter";
import type { DatePreset } from "@/components/admin/shared/AdminDateFilter";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ExpensesTab = dynamic(() => import("@/components/admin/ExpensesTab"), { loading: S });
const CostCenterTab = dynamic(() => import("@/components/admin/CostCenterTab"), { loading: S });
const InsuranceTab = dynamic(() => import("@/components/admin/InsuranceTab"), { loading: S });
const AssetManagerTab = dynamic(() => import("@/components/admin/AssetManagerTab"), { loading: S });

const MODULE_ID = "gastos-activos";

const TABS = [
  { id: "gastos", label: "Gastos", icon: Wallet },
  { id: "centros-costo", label: "Centros de Costo", icon: Building2 },
  { id: "seguros", label: "Pólizas y Seguros", icon: Shield },
  { id: "activos", label: "Activos Fijos", icon: Receipt },
];

export default function GastosActivosModule() {
  const [sub, setSub] = useState(TABS[0].id);
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Gastos & Activos"
        description="Control de gastos, centros de costo, seguros y activos fijos"
        icon={Receipt}
      >
        <AdminDateFilter value={datePreset} onChange={setDatePreset} />
      </AdminModuleHeader>

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      />

      {sub === "gastos" && <ExpensesTab />}
      {sub === "centros-costo" && <CostCenterTab />}
      {sub === "seguros" && <InsuranceTab />}
      {sub === "activos" && <AssetManagerTab />}
    </div>
  );
}
