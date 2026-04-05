"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { TrendingUp, Megaphone, Zap, LineChart, BarChart3, Gift } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminDateFilter from "@/components/admin/shared/AdminDateFilter";
import type { DatePreset } from "@/components/admin/shared/AdminDateFilter";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const MarketingAutomationTab = dynamic(() => import("@/components/admin/MarketingAutomationTab"), { loading: S });
const SalesForecastTab = dynamic(() => import("@/components/admin/SalesForecastTab"), { loading: S });
const ConversionMetricsTab = dynamic(() => import("@/components/admin/ConversionMetricsTab"), { loading: S });
const ReferralTab = dynamic(() => import("@/components/admin/ReferralTab"), { loading: S });
const CampañasTab = dynamic(() => import("@/components/admin/CampañasTab"), { loading: S });

const MODULE_ID = "ventas-marketing";

const TABS = [
  { id: "campanas", label: "Campañas", icon: Megaphone },
  { id: "marketing", label: "Automatización", icon: Zap },
  { id: "forecast", label: "Forecast Ventas", icon: LineChart },
  { id: "metricas", label: "Métricas", icon: BarChart3 },
  { id: "referidos", label: "Referidos", icon: Gift },
];

export default function VentasMarketingModule() {
  const [sub, setSub] = useState(TABS[0].id);
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Ventas & Marketing"
        description="Campañas, automatización, forecast y métricas de conversión"
        icon={TrendingUp}
      >
        <AdminDateFilter value={datePreset} onChange={setDatePreset} />
      </AdminModuleHeader>

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      />

      {sub === "campanas" && <CampañasTab />}
      {sub === "marketing" && <MarketingAutomationTab />}
      {sub === "forecast" && <SalesForecastTab />}
      {sub === "metricas" && <ConversionMetricsTab />}
      {sub === "referidos" && <ReferralTab />}
    </div>
  );
}
