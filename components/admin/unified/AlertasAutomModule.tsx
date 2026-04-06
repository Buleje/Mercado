"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { BellRing, Zap, GitBranch, Scale } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const AutoAlertEngineTab = dynamic(() => import("@/components/admin/AutoAlertEngineTab"), { loading: S });
const SmartRemindersTab = dynamic(() => import("@/components/admin/SmartRemindersTab"), { loading: S });
const WorkflowTemplatesTab = dynamic(() => import("@/components/admin/WorkflowTemplatesTab"), { loading: S });
const BusinessRulesTab = dynamic(() => import("@/components/admin/BusinessRulesTab"), { loading: S });

const MODULE_ID = "alertas-autom";

const TABS = [
  { id: "alertas", label: "Alertas Automáticas", icon: BellRing },
  { id: "recordatorios", label: "Recordatorios", icon: BellRing },
  { id: "flujos", label: "Flujos de Trabajo", icon: GitBranch },
  { id: "reglas", label: "Reglas de Negocio", icon: Scale },
];

export default function AlertasAutomModule() {
  const [sub, setSub] = useState(TABS[0].id);
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    fetch("/api/reminders")
      .then(r => r.ok ? r.json() : [])
      .then((data: { status: string }[]) => {
        if (Array.isArray(data)) {
          setOverdueCount(data.filter(r => r.status === "vencido").length);
        }
      })
      .catch(() => {});
  }, []);

  const tabsWithBadge = TABS.map(t =>
    t.id === "recordatorios" && overdueCount > 0
      ? { ...t, badge: overdueCount }
      : t,
  );

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Alertas & Automatización"
        description="Alertas automáticas, recordatorios, flujos de trabajo y reglas"
        icon={Zap}
      />

      <AdminTabBar
        tabs={tabsWithBadge}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      />

      {sub === "alertas" && <AutoAlertEngineTab />}
      {sub === "recordatorios" && <SmartRemindersTab />}
      {sub === "flujos" && <WorkflowTemplatesTab />}
      {sub === "reglas" && <BusinessRulesTab />}
    </div>
  );
}
