"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { FileText, FileBarChart, RefreshCw, ArrowUpDown, FolderOpen, Receipt } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminDateFilter from "@/components/admin/shared/AdminDateFilter";
import type { DatePreset } from "@/components/admin/shared/AdminDateFilter";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ReportsTab = dynamic(() => import("@/components/admin/ReportsTab"), { loading: S });
const AutoReportsTab = dynamic(() => import("@/components/admin/AutoReportsTab"), { loading: S });
const ImportExportTab = dynamic(() => import("@/components/admin/ImportExportTab"), { loading: S });
const DocumentManagerTab = dynamic(() => import("@/components/admin/DocumentManagerTab"), { loading: S });
const BulkInvoiceGenerator = dynamic(() => import("@/components/admin/BulkInvoiceGenerator"), { ssr: false, loading: S });

const MODULE_ID = "reportes-doc";

const TABS = [
  { id: "reportes", label: "Reportes", icon: FileBarChart },
  { id: "auto", label: "Automáticos", icon: RefreshCw },
  { id: "importar-exportar", label: "Importar / Exportar", icon: ArrowUpDown },
  { id: "documentos", label: "Documentos", icon: FolderOpen },
  { id: "masiva", label: "Facturación Masiva", icon: Receipt },
];

export default function ReportesDocModule() {
  const [sub, setSub] = useState(TABS[0].id);
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Reportes & Documentos"
        description="Reportes, exportación de datos, documentos y facturación masiva"
        icon={FileText}
      >
        <AdminDateFilter value={datePreset} onChange={setDatePreset} />
      </AdminModuleHeader>

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {sub === "reportes" && <ReportsTab />}
        {sub === "auto" && <AutoReportsTab />}
        {sub === "importar-exportar" && <ImportExportTab />}
        {sub === "documentos" && <DocumentManagerTab />}
        {sub === "masiva" && <BulkInvoiceGenerator />}
      </AdminTabBar>
    </div>
  );
}
