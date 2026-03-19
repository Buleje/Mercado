"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const PurchaseOrdersTab = dynamic(() => import("@/components/admin/PurchaseOrdersTab"), { loading: S });
const PurchasePlanningTab = dynamic(() => import("@/components/admin/PurchasePlanningTab"), { loading: S });
const PurchaseApprovalTab = dynamic(() => import("@/components/admin/PurchaseApprovalTab"), { loading: S });
const PurchaseContractsTab = dynamic(() => import("@/components/admin/PurchaseContractsTab"), { loading: S });
const RFQTab = dynamic(() => import("@/components/admin/RFQTab"), { loading: S });
const ReceivingTab = dynamic(() => import("@/components/admin/ReceivingTab"), { loading: S });

const TABS = [
  { id: "ordenes" as const, label: "Órdenes" },
  { id: "planificacion" as const, label: "Planificación" },
  { id: "aprobaciones" as const, label: "Aprobaciones" },
  { id: "contratos" as const, label: "Contratos" },
  { id: "cotizaciones" as const, label: "Cotizaciones (RFQ)" },
  { id: "recepcion" as const, label: "Recepción" },
];

export default function ComprasModule() {
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
      {sub === "ordenes" && <PurchaseOrdersTab />}
      {sub === "planificacion" && <PurchasePlanningTab />}
      {sub === "aprobaciones" && <PurchaseApprovalTab />}
      {sub === "contratos" && <PurchaseContractsTab />}
      {sub === "cotizaciones" && <RFQTab />}
      {sub === "recepcion" && <ReceivingTab />}
    </div>
  );
}
