"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Server, HeartPulse, HardDrive, Webhook } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const SystemHealthTab = dynamic(() => import("@/components/admin/SystemHealthTab"), { loading: S });
const BackupRestoreTab = dynamic(() => import("@/components/admin/BackupRestoreTab"), { loading: S });
const WebhooksTab = dynamic(() => import("@/components/admin/WebhooksTab"), { loading: S });

const MODULE_ID = "sistema";

const TABS = [
  { id: "salud", label: "Salud del Sistema", icon: HeartPulse },
  { id: "backup", label: "Backup y Restaurar", icon: HardDrive },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
];

export default function SistemaModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Sistema"
        description="Salud del sistema, backups y webhooks"
        icon={Server}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {sub === "salud" && <SystemHealthTab />}
        {sub === "backup" && <BackupRestoreTab />}
        {sub === "webhooks" && <WebhooksTab />}
      </AdminTabBar>
    </div>
  );
}
