"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const CRMTab = dynamic(() => import("@/components/admin/CRMTab"), { loading: S });
const DeliveryRoutesTab = dynamic(() => import("@/components/admin/DeliveryRoutesTab"), { loading: S });
const NPSTab = dynamic(() => import("@/components/admin/NPSTab"), { loading: S });
const LoyaltyTab = dynamic(() => import("@/components/admin/LoyaltyTab"), { loading: S });

const TABS = [
  { id: "crm" as const, label: "Mis clientes" },
  { id: "delivery" as const, label: "Delivery" },
  { id: "opiniones" as const, label: "Opiniones" },
  { id: "fidelizacion" as const, label: "Clientes frecuentes" },
];

export default function CRMClientesModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none border-b border-gray-200 dark:border-card-border -mx-1 px-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`shrink-0 px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${
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
      {sub === "delivery" && <DeliveryRoutesTab />}
      {sub === "opiniones" && <NPSTab />}
      {sub === "fidelizacion" && <LoyaltyTab />}
    </div>
  );
}
