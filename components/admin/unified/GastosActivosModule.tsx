"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ExpensesTab = dynamic(() => import("@/components/admin/ExpensesTab"), { loading: S });
const CostCenterTab = dynamic(() => import("@/components/admin/CostCenterTab"), { loading: S });
const InsuranceTab = dynamic(() => import("@/components/admin/InsuranceTab"), { loading: S });
const AssetManagerTab = dynamic(() => import("@/components/admin/AssetManagerTab"), { loading: S });

const TABS = [
  { id: "gastos" as const, label: "Gastos" },
  { id: "centros-costo" as const, label: "Centros de Costo" },
  { id: "seguros" as const, label: "Pólizas y Seguros" },
  { id: "activos" as const, label: "Activos Fijos" },
];

export default function GastosActivosModule() {
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
      {sub === "gastos" && <ExpensesTab />}
      {sub === "centros-costo" && <CostCenterTab />}
      {sub === "seguros" && <InsuranceTab />}
      {sub === "activos" && <AssetManagerTab />}
    </div>
  );
}
