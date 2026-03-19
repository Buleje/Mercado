"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ReportsTab = dynamic(() => import("@/components/admin/ReportsTab"), { loading: S });
const AutoReportsTab = dynamic(() => import("@/components/admin/AutoReportsTab"), { loading: S });
const ImportExportTab = dynamic(() => import("@/components/admin/ImportExportTab"), { loading: S });
const DocumentManagerTab = dynamic(() => import("@/components/admin/DocumentManagerTab"), { loading: S });

const TABS = [
  { id: "reportes" as const, label: "Reportes" },
  { id: "auto" as const, label: "Automáticos" },
  { id: "importar-exportar" as const, label: "Importar / Exportar" },
  { id: "documentos" as const, label: "Documentos" },
];

export default function ReportesDocModule() {
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
      {sub === "reportes" && <ReportsTab />}
      {sub === "auto" && <AutoReportsTab />}
      {sub === "importar-exportar" && <ImportExportTab />}
      {sub === "documentos" && <DocumentManagerTab />}
    </div>
  );
}
