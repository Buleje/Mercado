"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Users, UserCog, DollarSign, Award, Building } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const HRTab = dynamic(() => import("@/components/admin/HRTab"), { loading: S });
const PayrollTab = dynamic(() => import("@/components/admin/PayrollTab"), { loading: S });
const BranchesTab = dynamic(() => import("@/components/admin/BranchesTab"), { loading: S });
const ComisionesTab = dynamic(() => import("@/components/admin/ComisionesTab"), { loading: S });

const MODULE_ID = "rrhh";

const TABS = [
  { id: "rrhh", label: "Recursos Humanos", icon: UserCog },
  { id: "nomina", label: "Nómina", icon: DollarSign },
  { id: "comisiones", label: "Comisiones", icon: Award },
  { id: "sucursales", label: "Sucursales", icon: Building },
];

export default function RRHHModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Recursos Humanos"
        description="Personal, nómina, comisiones y sucursales"
        icon={Users}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {sub === "rrhh" && <HRTab />}
        {sub === "nomina" && <PayrollTab />}
        {sub === "comisiones" && <ComisionesTab />}
        {sub === "sucursales" && <BranchesTab />}
      </AdminTabBar>
    </div>
  );
}
