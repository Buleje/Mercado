"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Truck, CalendarDays, Map, Clock, DollarSign, Car, RotateCcw } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const DeliveryCalendarTab = dynamic(() => import("@/components/admin/DeliveryCalendarTab"), { loading: S });
const DeliveryRoutesTab = dynamic(() => import("@/components/admin/DeliveryRoutesTab"), { loading: S });
const DeliveryScheduleTab = dynamic(() => import("@/components/admin/DeliveryScheduleTab"), { loading: S });
const ShipmentTrackingTab = dynamic(() => import("@/components/admin/ShipmentTrackingTab"), { loading: S });
const ShippingCostsTab = dynamic(() => import("@/components/admin/ShippingCostsTab"), { loading: S });
const FleetManagementTab = dynamic(() => import("@/components/admin/FleetManagementTab"), { loading: S });
const ReturnLogisticsTab = dynamic(() => import("@/components/admin/ReturnLogisticsTab"), { loading: S });

const MODULE_ID = "logistica";

const TABS = [
  { id: "calendario", label: "Calendario", icon: CalendarDays },
  { id: "rutas", label: "Rutas", icon: Map },
  { id: "horarios", label: "Horarios", icon: Clock },
  { id: "seguimiento", label: "Seguimiento", icon: Truck },
  { id: "costos", label: "Costos Envío", icon: DollarSign },
  { id: "flota", label: "Flota", icon: Car },
  { id: "logistica-rev", label: "Logística Reversa", icon: RotateCcw },
];

export default function LogisticaModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Logística"
        description="Rutas de entrega, seguimiento, flota y costos de envío"
        icon={Truck}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      />

      {sub === "calendario" && <DeliveryCalendarTab />}
      {sub === "rutas" && <DeliveryRoutesTab />}
      {sub === "horarios" && <DeliveryScheduleTab />}
      {sub === "seguimiento" && <ShipmentTrackingTab />}
      {sub === "costos" && <ShippingCostsTab />}
      {sub === "flota" && <FleetManagementTab />}
      {sub === "logistica-rev" && <ReturnLogisticsTab />}
    </div>
  );
}
