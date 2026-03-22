"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

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

const TABS = [
  { id: "usuarios" as const, label: "Usuarios" },
  { id: "roles" as const, label: "Roles y Permisos" },
  { id: "logs" as const, label: "Logs Seguridad" },
  { id: "auditoria" as const, label: "Auditoría" },
  { id: "actividad" as const, label: "Actividad" },
  { id: "cumplimiento" as const, label: "Cumplimiento" },
];

export default function SeguridadModule() {
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
      {sub === "usuarios" && <AdminUsersTab />}
      {sub === "roles" && <RolePermissionsTab />}
      {sub === "logs" && <SecurityLogsTab />}
      {sub === "auditoria" && <AuditLogTab />}
      {sub === "actividad" && <ActivityLogTab />}
      {sub === "cumplimiento" && <ComplianceTab />}
    </div>
  );
}
