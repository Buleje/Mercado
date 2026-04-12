"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Shield, UserCheck, Key, FileSearch, ClipboardCheck, Activity, Scale } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const AdminUsersTab = dynamic(() => import("@/components/admin/AdminUsersTab"), { loading: S });
const RolePermissionsTab = dynamic(() => import("@/components/admin/RolePermissionsTab"), { loading: S });
const SecurityLogsTab = dynamic(() => import("@/components/admin/SecurityLogsTab"), { loading: S });
const AuditLogTab = dynamic(() => import("@/components/admin/AuditLogTab"), { loading: S });
const ActivityLogTab = dynamic(() => import("@/components/admin/ActivityLogTab"), { loading: S });
const ComplianceTab = dynamic(() => import("@/components/admin/ComplianceTab"), { loading: S });

const MODULE_ID = "seguridad";

const TABS = [
  { id: "usuarios", label: "Usuarios", icon: UserCheck },
  { id: "roles", label: "Roles y Permisos", icon: Key },
  { id: "logs", label: "Logs Seguridad", icon: FileSearch },
  { id: "auditoria", label: "Auditoría", icon: ClipboardCheck },
  { id: "actividad", label: "Actividad", icon: Activity },
  { id: "cumplimiento", label: "Cumplimiento", icon: Scale },
];

export default function SeguridadModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Seguridad"
        description="Usuarios, roles, logs de seguridad, auditoría y cumplimiento"
        icon={Shield}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {sub === "usuarios" && <AdminUsersTab />}
        {sub === "roles" && <RolePermissionsTab />}
        {sub === "logs" && <SecurityLogsTab />}
        {sub === "auditoria" && <AuditLogTab />}
        {sub === "actividad" && <ActivityLogTab />}
        {sub === "cumplimiento" && <ComplianceTab />}
      </AdminTabBar>
    </div>
  );
}
