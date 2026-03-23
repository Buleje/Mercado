"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const PLTab = dynamic(() => import("@/components/admin/PLTab"), { loading: S });
const ExpensesTab = dynamic(() => import("@/components/admin/ExpensesTab"), { loading: S });
const ProfitabilityTab = dynamic(() => import("@/components/admin/ProfitabilityTab"), { loading: S });
const ReportsTab = dynamic(() => import("@/components/admin/ReportsTab"), { loading: S });
const ImportExportTab = dynamic(() => import("@/components/admin/ImportExportTab"), { loading: S });

const TABS = [
  { id: "pl" as const, label: "Ingresos y egresos" },
  { id: "gastos" as const, label: "Gastos" },
  { id: "rentabilidad" as const, label: "Ganancias por producto" },
  { id: "reportes" as const, label: "Reportes" },
  { id: "exportar" as const, label: "Exportar a Excel" },
];

export default function FinanzasModule() {
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
      {sub === "pl" && <PLTab />}
      {sub === "gastos" && <ExpensesTab />}
      {sub === "rentabilidad" && <ProfitabilityTab />}
      {sub === "reportes" && <ReportsTab />}
      {sub === "exportar" && <ImportExportTab />}
    </div>
  );
}
