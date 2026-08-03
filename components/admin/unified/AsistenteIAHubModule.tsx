"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { BotMessageSquare, Wand2, Lightbulb } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Hub del Asistente IA (consolidación 3→1) ─────────────────────────────────
// Antes eran 3 entradas top-level separadas (asistente-ia, ai-command,
// sugerencias-ia). Ahora viven como sub-tabs de un solo centro de IA. El header
// "Asistente IA" se muestra SIEMPRE arriba (coherencia admin, Brandon
// 2026-06-19); cada módulo conserva su sub-header debajo.
const ChatIAModule        = dynamic(() => import("@/components/admin/unified/ChatIAModule"),        { loading: S, ssr: false });
const AICommandModule     = dynamic(() => import("@/components/admin/unified/AICommandModule"),     { loading: S });
const SugerenciasIAModule = dynamic(() => import("@/components/admin/unified/SugerenciasIAModule"), { loading: S });

const MODULE_ID = "asistente-ia-hub";

const TABS = [
  { id: "chat",        label: "Chat IA",        icon: BotMessageSquare },
  { id: "comandos",    label: "Comandos IA",    icon: Wand2 },
  { id: "sugerencias", label: "Sugerencias IA", icon: Lightbulb },
];

export default function AsistenteIAHubModule({ initialTab }: { initialTab?: string } = {}) {
  const [sub, setSub] = useState(() => {
    if (initialTab) return initialTab;
    if (typeof window === "undefined") return TABS[0].id;
    return localStorage.getItem(`admin-last-tab-${MODULE_ID}`) || TABS[0].id;
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        eyebrow="Inicio · Asistente"
        title="Asistente IA"
        description="Chat, comandos y sugerencias sobre tu negocio."
        icon={BotMessageSquare}
      />
      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "chat" && <ChatIAModule />}
        {sub === "comandos" && <AICommandModule />}
        {sub === "sugerencias" && <SugerenciasIAModule />}
      </AdminTabBar>
    </div>
  );
}
