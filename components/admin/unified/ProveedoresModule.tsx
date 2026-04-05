"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Building2, BookOpen, Globe, Star, ShieldCheck, Wallet } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const SuppliersTab = dynamic(() => import("@/components/admin/SuppliersTab"), { loading: S });
const SupplierPortalTab = dynamic(() => import("@/components/admin/SupplierPortalTab"), { loading: S });
const SupplierEvaluationsTab = dynamic(() => import("@/components/admin/SupplierEvaluationsTab"), { loading: S });
const SupplierQualityTab = dynamic(() => import("@/components/admin/SupplierQualityTab"), { loading: S });
const SupplierPaymentsTab = dynamic(() => import("@/components/admin/SupplierPaymentsTab"), { loading: S });

const MODULE_ID = "proveedores";

const TABS = [
  { id: "directorio", label: "Directorio", icon: BookOpen },
  { id: "portal", label: "Portal", icon: Globe },
  { id: "evaluaciones", label: "Evaluaciones", icon: Star },
  { id: "calidad", label: "Calidad", icon: ShieldCheck },
  { id: "pagos", label: "Pagos", icon: Wallet },
];

export default function ProveedoresModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Proveedores"
        description="Directorio, portal, evaluaciones, calidad y pagos de proveedores"
        icon={Building2}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      />

      {sub === "directorio" && <SuppliersTab />}
      {sub === "portal" && <SupplierPortalTab />}
      {sub === "evaluaciones" && <SupplierEvaluationsTab />}
      {sub === "calidad" && <SupplierQualityTab />}
      {sub === "pagos" && <SupplierPaymentsTab />}
    </div>
  );
}
