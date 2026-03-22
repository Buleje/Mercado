"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const AutoAlertEngineTab = dynamic(() => import("@/components/admin/AutoAlertEngineTab"), { loading: S });
const SmartRemindersTab = dynamic(() => import("@/components/admin/SmartRemindersTab"), { loading: S });
const WorkflowTemplatesTab = dynamic(() => import("@/components/admin/WorkflowTemplatesTab"), { loading: S });
const BusinessRulesTab = dynamic(() => import("@/components/admin/BusinessRulesTab"), { loading: S });

const TABS = [
  { id: "alertas" as const, label: "Alertas Automáticas" },
  { id: "recordatorios" as const, label: "Recordatorios" },
  { id: "flujos" as const, label: "Flujos de Trabajo" },
  { id: "reglas" as const, label: "Reglas de Negocio" },
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
            {t.id === "recordatorios" && overdueCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1">
                {overdueCount}
              </span>
            )}
          </button>
        ))}
      </div>
      {sub === "alertas" && <AutoAlertEngineTab />}
      {sub === "recordatorios" && <SmartRemindersTab />}
      {sub === "flujos" && <WorkflowTemplatesTab />}
      {sub === "reglas" && <BusinessRulesTab />}
    </div>
  );
}
