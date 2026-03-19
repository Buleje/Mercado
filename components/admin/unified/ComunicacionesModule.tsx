"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const CommunicationHubTab = dynamic(() => import("@/components/admin/CommunicationHubTab"), { loading: S });
const AdminChatTab = dynamic(() => import("@/components/admin/AdminChatTab"), { loading: S });
const MessageTemplatesTab = dynamic(() => import("@/components/admin/MessageTemplatesTab"), { loading: S });
const NotificationsTab = dynamic(() => import("@/components/admin/NotificationsTab"), { loading: S });

const TABS = [
  { id: "hub" as const, label: "Hub" },
  { id: "chat" as const, label: "Chat Interno" },
  { id: "plantillas" as const, label: "Plantillas" },
  { id: "notificaciones" as const, label: "Notificaciones" },
];

export default function ComunicacionesModule() {
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
      {sub === "hub" && <CommunicationHubTab />}
      {sub === "chat" && <AdminChatTab />}
      {sub === "plantillas" && <MessageTemplatesTab />}
      {sub === "notificaciones" && <NotificationsTab />}
    </div>
  );
}
