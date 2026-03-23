"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from "react";
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
const BudgetVsRealTab = dynamic(() => import("@/components/admin/BudgetVsRealTab"), { loading: S });
const WeeklyReportCard = dynamic(() => import("@/components/admin/WeeklyReportCard"), { loading: S });
const BudgetAlertWidget = dynamic(() => import("@/components/admin/BudgetAlertWidget"), { loading: S });
const MonthProjectionCard = dynamic(() => import("@/components/admin/MonthProjectionCard"), { loading: S });
const ProfitLossAutoCard = dynamic(() => import("@/components/admin/ProfitLossAutoCard"), { loading: S });
const CashFlowProjection = dynamic(() => import("@/components/admin/CashFlowProjection"), { loading: S });
const BreakEvenDashboard = dynamic(() => import("@/components/admin/BreakEvenDashboard"), { loading: S });
const LoanCalculator = dynamic(() => import("@/components/admin/LoanCalculator"), { loading: S });
const CommissionCalculator = dynamic(() => import("@/components/admin/CommissionCalculator"), { loading: S });
const PaymentCalendar = dynamic(() => import("@/components/admin/PaymentCalendar"), { loading: S });
const MoneyLeakDetector = dynamic(() => import("@/components/admin/MoneyLeakDetector"), { loading: S });
const WeeklyCashFlowTable = dynamic(() => import("@/components/admin/WeeklyCashFlowTable"), { loading: S });

const TABS = [
  { id: "pl" as const, label: "Ingresos y egresos" },
  { id: "gastos" as const, label: "Gastos" },
  { id: "rentabilidad" as const, label: "Cuánto gano por producto" },
  { id: "presupuesto" as const, label: "Meta vs Real" },
  { id: "reportes" as const, label: "Reportes" },
  { id: "exportar" as const, label: "Descargar a Excel" },
  { id: "resumen-auto" as const, label: "Resumen automático" },
  { id: "flujo-caja" as const, label: "Flujo de caja" },
  { id: "pagos" as const, label: "Calendario pagos" },
  { id: "comisiones" as const, label: "Comisiones" },
  { id: "prestamo" as const, label: "Calculadora préstamo" },
];

export default function FinanzasModule() {
  const [sub, setSub] = useState(TABS[0].id);
  const [bannerVisible, setBannerVisible] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem("banner-finanzas");
    if (stored === "hidden") setBannerVisible(false);
  }, []);
  const toggleBanner = () => {
    const next = !bannerVisible;
    setBannerVisible(next);
    localStorage.setItem("banner-finanzas", next ? "visible" : "hidden");
  };
  return (
    <div className="space-y-3 sm:space-y-6">
      {bannerVisible && (
        <button onClick={toggleBanner} className="w-full text-left bg-[#2d6a4f]/5 dark:bg-[#2d6a4f]/10 border border-[#2d6a4f]/20 rounded-xl p-3 mb-1 transition-colors hover:bg-[#2d6a4f]/10">
          <p className="text-sm text-[#2d6a4f] dark:text-emerald-400">
            <span className="font-semibold">Finanzas</span> — Aquí ves cuánto entra, cuánto sale y cuánto ganas. También puedes descargar reportes a Excel.
          </p>
        </button>
      )}
      {!bannerVisible && (
        <button onClick={toggleBanner} className="text-xs text-gray-400 hover:text-[#2d6a4f] transition-colors">
          Mostrar descripción
        </button>
      )}
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
      {sub === "presupuesto" && <BudgetVsRealTab />}
      {sub === "reportes" && <ReportsTab />}
      {sub === "exportar" && <ImportExportTab />}
      {sub === "resumen-auto" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ProfitLossAutoCard />
          <MonthProjectionCard />
          <BreakEvenDashboard />
          <BudgetAlertWidget />
          <WeeklyReportCard />
          <MoneyLeakDetector />
        </div>
      )}
      {sub === "flujo-caja" && (
        <div className="space-y-4">
          <CashFlowProjection />
          <WeeklyCashFlowTable />
        </div>
      )}
      {sub === "pagos" && <PaymentCalendar />}
      {sub === "comisiones" && <CommissionCalculator />}
      {sub === "prestamo" && <LoanCalculator />}
    </div>
  );
}
