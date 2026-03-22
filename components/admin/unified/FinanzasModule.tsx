"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const PLTab = dynamic(() => import("@/components/admin/PLTab"), { loading: S });
const BalanceSheetTab = dynamic(() => import("@/components/admin/BalanceSheetTab"), { loading: S });
const CashFlowTab = dynamic(() => import("@/components/admin/CashFlowTab"), { loading: S });
const BudgetTab = dynamic(() => import("@/components/admin/BudgetTab"), { loading: S });
const BudgetVsRealTab = dynamic(() => import("@/components/admin/BudgetVsRealTab"), { loading: S });
const BreakEvenTab = dynamic(() => import("@/components/admin/BreakEvenTab"), { loading: S });
const ProfitabilityTab = dynamic(() => import("@/components/admin/ProfitabilityTab"), { loading: S });
const MarginDashboardTab = dynamic(() => import("@/components/admin/MarginDashboardTab"), { loading: S });

const TABS = [
  { id: "pl" as const, label: "P&G" },
  { id: "balance" as const, label: "Balance General" },
  { id: "flujo-caja" as const, label: "Flujo de Caja" },
  { id: "presupuestos" as const, label: "Presupuestos" },
  { id: "ppto-real" as const, label: "Ppto vs Real" },
  { id: "break-even" as const, label: "Punto Equilibrio" },
  { id: "rentabilidad" as const, label: "Rentabilidad" },
  { id: "margenes" as const, label: "Márgenes" },
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
      {sub === "balance" && <BalanceSheetTab />}
      {sub === "flujo-caja" && <CashFlowTab />}
      {sub === "presupuestos" && <BudgetTab />}
      {sub === "ppto-real" && <BudgetVsRealTab />}
      {sub === "break-even" && <BreakEvenTab />}
      {sub === "rentabilidad" && <ProfitabilityTab />}
      {sub === "margenes" && <MarginDashboardTab />}
    </div>
  );
}
