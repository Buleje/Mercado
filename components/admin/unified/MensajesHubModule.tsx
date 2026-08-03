"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { MessageCircle, MessageSquare, Inbox, FileText, Settings, BellRing } from "@buleje/design-system/icons";
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
// Brandon 2026-06-17: WhatsAppTemplates estaba huérfano (0 imports). Montado como
// 3er sub-tab — plantillas de WhatsApp con variables para el operador.
const WhatsAppTemplates = dynamic(() => import("@/components/admin/WhatsAppTemplates"), { loading: S });
// Brandon 2026-06-17: config del bot WhatsApp (TenantWhatsAppConfig) — antes solo
// se poblaba por DB. Self-serve para activar el bot que toma pedidos por tenant.
const WhatsAppBotConfig = dynamic(() => import("@/components/admin/whatsapp/WhatsAppBotConfig"), { loading: S });
// Avisos WhatsApp por pedido (NotificationsTab) — estaba huérfano; real (/api/notifications
// + /api/orders), CSRF, log de enviados. Montado tras verificar. Brandon 2026-06-20.
const NotificationsTab = dynamic(() => import("@/components/admin/NotificationsTab"), { loading: S });
// Inbox WhatsApp real (Meta Cloud API) — Brandon 2026-07-16: conversaciones del
// número del negocio, con respuesta desde el panel. Log en WhatsAppMessage (migración 310).
const WhatsAppInboxTab = dynamic(() => import("@/components/admin/whatsapp/WhatsAppInboxTab"), { loading: S });

const MODULE_ID = "mensajes-hub";

const TABS = [
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "chat",    label: "Chat con clientes", icon: MessageSquare },
  { id: "soporte", label: "Soporte",           icon: Inbox },
  { id: "avisos", label: "Avisos por pedido", icon: BellRing },
  { id: "plantillas", label: "Plantillas WhatsApp", icon: FileText },
  { id: "bot", label: "Bot WhatsApp", icon: Settings },
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
        eyebrow="Clientes · Mensajes"
        title="Mensajes"
        description="WhatsApp, chat con clientes y bandeja de soporte."
        icon={MessageCircle}
      />
      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "whatsapp" && <WhatsAppInboxTab onGoToConfig={() => setSub("bot")} />}
        {sub === "chat" && <ChatTab />}
        {sub === "soporte" && <UnifiedSupportInbox />}
        {sub === "avisos" && <NotificationsTab />}
        {sub === "plantillas" && <WhatsAppTemplates />}
        {sub === "bot" && <WhatsAppBotConfig />}
      </AdminTabBar>
    </div>
  );
}
