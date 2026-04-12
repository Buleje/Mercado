"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { MessageSquare, Inbox, Radio, MessagesSquare, FileText, MessageCircle, Bell } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const CommunicationHubTab = dynamic(() => import("@/components/admin/CommunicationHubTab"), { loading: S });
const AdminChatTab = dynamic(() => import("@/components/admin/AdminChatTab"), { loading: S });
const MessageTemplatesTab = dynamic(() => import("@/components/admin/MessageTemplatesTab"), { loading: S });
const NotificationsTab = dynamic(() => import("@/components/admin/NotificationsTab"), { loading: S });
const WhatsAppTemplates = dynamic(() => import("@/components/admin/WhatsAppTemplates"), { loading: S });
const WhatsAppInbox = dynamic(() => import("@/components/admin/WhatsAppInbox"), { loading: S });

const MODULE_ID = "comunicaciones";

const TABS = [
  { id: "inbox", label: "Inbox WA", icon: Inbox },
  { id: "hub", label: "Hub", icon: Radio },
  { id: "chat", label: "Chat Interno", icon: MessagesSquare },
  { id: "plantillas", label: "Plantillas", icon: FileText },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "notificaciones", label: "Notificaciones", icon: Bell },
];

export default function ComunicacionesModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Comunicaciones"
        description="Inbox WhatsApp, chat interno, plantillas y notificaciones"
        icon={MessageSquare}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {sub === "inbox" && <WhatsAppInbox />}
        {sub === "hub" && <CommunicationHubTab />}
        {sub === "chat" && <AdminChatTab />}
        {sub === "plantillas" && <MessageTemplatesTab />}
        {sub === "whatsapp" && <WhatsAppTemplates />}
        {sub === "notificaciones" && <NotificationsTab />}
      </AdminTabBar>
    </div>
  );
}
