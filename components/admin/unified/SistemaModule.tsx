"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const SystemHealthTab = dynamic(() => import("@/components/admin/SystemHealthTab"), { loading: S });
const BackupRestoreTab = dynamic(() => import("@/components/admin/BackupRestoreTab"), { loading: S });
const WebhooksTab = dynamic(() => import("@/components/admin/WebhooksTab"), { loading: S });

const TABS = [
  { id: "salud" as const, label: "Salud del Sistema" },
  { id: "backup" as const, label: "Backup y Restaurar" },
  { id: "webhooks" as const, label: "Webhooks" },
];

export default function SistemaModule() {
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
      {sub === "salud" && <SystemHealthTab />}
      {sub === "backup" && <BackupRestoreTab />}
      {sub === "webhooks" && <WebhooksTab />}
    </div>
  );
}
