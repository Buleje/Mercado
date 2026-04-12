"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { RotateCcw, PackageX, Layers, ShieldCheck, AlertTriangle } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ReturnsTab = dynamic(() => import("@/components/admin/ReturnsTab"), { loading: S });
const AdvancedReturnsTab = dynamic(() => import("@/components/admin/AdvancedReturnsTab"), { loading: S });
const QualityControlTab = dynamic(() => import("@/components/admin/QualityControlTab"), { loading: S });
const AnomalyDetectionTab = dynamic(() => import("@/components/admin/AnomalyDetectionTab"), { loading: S });

const MODULE_ID = "devoluciones-calidad";

const TABS = [
  { id: "devoluciones", label: "Devoluciones", icon: PackageX },
  { id: "avanzadas", label: "Avanzadas", icon: Layers },
  { id: "calidad", label: "Control Calidad", icon: ShieldCheck },
  { id: "anomalias", label: "Anomalías", icon: AlertTriangle },
];

export default function DevolucionesCalidadModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Devoluciones & Calidad"
        description="Gestión de devoluciones, control de calidad y detección de anomalías"
        icon={RotateCcw}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {sub === "devoluciones" && <ReturnsTab />}
        {sub === "avanzadas" && <AdvancedReturnsTab />}
        {sub === "calidad" && <QualityControlTab />}
        {sub === "anomalias" && <AnomalyDetectionTab />}
      </AdminTabBar>
    </div>
  );
}
