"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Landmark, HandCoins, CalendarDays, Calendar, CalendarRange, Wallet, Receipt, FileCheck, CreditCard, DollarSign } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminDateFilter from "@/components/admin/shared/AdminDateFilter";
import type { DatePreset } from "@/components/admin/shared/AdminDateFilter";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const TreasuryTab = dynamic(() => import("@/components/admin/TreasuryTab"), { loading: S });
const LiquidityForecastTab = dynamic(() => import("@/components/admin/LiquidityForecastTab"), { loading: S });
const CheckManagementTab = dynamic(() => import("@/components/admin/CheckManagementTab"), { loading: S });
const BankReconciliationTab = dynamic(() => import("@/components/admin/BankReconciliationTab"), { loading: S });
const CollectionCenterTab = dynamic(() => import("@/components/admin/CollectionCenterTab"), { loading: S });
const AccountsReceivableTab = dynamic(() => import("@/components/admin/AccountsReceivableTab"), { loading: S });
const PayablesTab = dynamic(() => import("@/components/admin/PayablesTab"), { loading: S });
const CxPCalendar = dynamic(() => import("@/components/admin/compras/CxPCalendar"), { loading: S });
const PaymentCalendar = dynamic(() => import("@/components/admin/PaymentCalendar"), { loading: S });
const PaymentCalendarView = dynamic(() => import("@/components/admin/PaymentCalendarView"), { ssr: false, loading: S });

const MODULE_ID = "tesoreria";

const TABS = [
  { id: "tesoreria", label: "Tesorería", icon: Landmark },
  { id: "liquidez", label: "Proyección Liquidez", icon: Wallet },
  { id: "cheques", label: "Cheques", icon: Receipt },
  { id: "conciliacion", label: "Conciliación", icon: FileCheck },
  { id: "cobros", label: "Centro Cobros", icon: DollarSign },
  { id: "cxc", label: "Cuentas x Cobrar", icon: CreditCard },
  { id: "cuentas-pagar", label: "Cuentas por Pagar", icon: HandCoins },
  { id: "calendario-cxp", label: "Calendario CxP", icon: CalendarDays },
  { id: "pagos", label: "Calendario Pagos", icon: Calendar },
  { id: "calendario", label: "Calendario Completo", icon: CalendarRange },
];

export default function TesoreriaModule() {
  const [sub, setSub] = useState(TABS[0].id);
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Tesorería"
        description="Flujo de caja, cobros, pagos y conciliación bancaria"
        icon={Landmark}
      >
        <AdminDateFilter value={datePreset} onChange={setDatePreset} />
      </AdminModuleHeader>

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      />

      {sub === "tesoreria" && <TreasuryTab />}
      {sub === "liquidez" && <LiquidityForecastTab />}
      {sub === "cheques" && <CheckManagementTab />}
      {sub === "conciliacion" && <BankReconciliationTab />}
      {sub === "cobros" && <CollectionCenterTab />}
      {sub === "cxc" && <AccountsReceivableTab />}
      {sub === "cuentas-pagar" && <PayablesTab />}
      {sub === "calendario-cxp" && <CxPCalendar />}
      {sub === "pagos" && <PaymentCalendar />}
      {sub === "calendario" && <PaymentCalendarView />}
    </div>
  );
}
