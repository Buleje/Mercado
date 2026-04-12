"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { HelpCircle, BarChart3, ClipboardList, Headphones } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const NPSTab = dynamic(() => import("@/components/admin/NPSTab"), { loading: S });
const SurveysTab = dynamic(() => import("@/components/admin/SurveysTab"), { loading: S });
const SupportTicketsTab = dynamic(() => import("@/components/admin/SupportTicketsTab"), { loading: S });

const MODULE_ID = "encuestas-soporte";

const TABS = [
  { id: "nps", label: "NPS", icon: BarChart3 },
  { id: "encuestas", label: "Encuestas", icon: ClipboardList },
  { id: "soporte", label: "Tickets", icon: Headphones },
];

export default function EncuestasSoporteModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Encuestas & Soporte"
        description="Índice NPS, encuestas de satisfacción y tickets de soporte"
        icon={HelpCircle}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {sub === "nps" && <NPSTab />}
        {sub === "encuestas" && <SurveysTab />}
        {sub === "soporte" && <SupportTicketsTab />}
      </AdminTabBar>
    </div>
  );
}
