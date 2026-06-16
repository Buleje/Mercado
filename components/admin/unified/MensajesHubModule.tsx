"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { MessageCircle, Inbox } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Hub de Mensajes (consolidación 2→1) ──────────────────────────────────────
// Antes: 2 entradas top-level (marketplace-chat, support-inbox). Ahora 1 bandeja
// con 2 sub-tabs. Ninguno de los dos módulos trae header propio → el hub provee
// el header "Mensajes" (no hay doble header).
const ChatTab            = dynamic(() => import("@/components/admin/ChatTab"), { loading: S });
const UnifiedSupportInbox = dynamic(
  () => import("@/components/admin/support/UnifiedSupportInbox").then((m) => ({ default: m.UnifiedSupportInbox })),
  { loading: S },
);

const MODULE_ID = "mensajes-hub";

const TABS = [
  { id: "chat",    label: "Chat con clientes", icon: MessageCircle },
  { id: "soporte", label: "Soporte",           icon: Inbox },
];

export default function MensajesHubModule({ initialTab }: { initialTab?: string } = {}) {
  const [sub, setSub] = useState(() => {
    if (initialTab) return initialTab;
    if (typeof window === "undefined") return TABS[0].id;
    return localStorage.getItem(`admin-last-tab-${MODULE_ID}`) || TABS[0].id;
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Mensajes"
        description="Bandeja unificada: chats con clientes y soporte de la plataforma."
        icon={MessageCircle}
      />
      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "chat" && <ChatTab />}
        {sub === "soporte" && <UnifiedSupportInbox />}
      </AdminTabBar>
    </div>
  );
}
