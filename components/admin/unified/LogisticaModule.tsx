"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

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

const TABS = [
  { id: "calendario" as const, label: "Calendario" },
  { id: "rutas" as const, label: "Rutas" },
  { id: "horarios" as const, label: "Horarios" },
  { id: "seguimiento" as const, label: "Seguimiento" },
  { id: "costos" as const, label: "Costos Envío" },
  { id: "flota" as const, label: "Flota" },
  { id: "logistica-rev" as const, label: "Logística Reversa" },
];

export default function LogisticaModule() {
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
