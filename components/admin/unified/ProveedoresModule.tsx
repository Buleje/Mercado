"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

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

const TABS = [
  { id: "directorio" as const, label: "Directorio" },
  { id: "portal" as const, label: "Portal" },
  { id: "evaluaciones" as const, label: "Evaluaciones" },
  { id: "calidad" as const, label: "Calidad" },
  { id: "pagos" as const, label: "Pagos" },
];

export default function ProveedoresModule() {
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
      {sub === "directorio" && <SuppliersTab />}
      {sub === "portal" && <SupplierPortalTab />}
      {sub === "evaluaciones" && <SupplierEvaluationsTab />}
      {sub === "calidad" && <SupplierQualityTab />}
      {sub === "pagos" && <SupplierPaymentsTab />}
    </div>
  );
}
