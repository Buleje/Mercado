"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Brain, MessageSquare, Stethoscope, Lightbulb, Target } from "lucide-react";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const AIAssistant = dynamic(
  () => import("@/components/admin/AIAssistant"),
  { ssr: false, loading: S },
);
// AlertsCenterTab movido a superadmin
const AICommandCenter = dynamic(
  () => import("@/components/admin/ai-center/AICommandCenter"),
  { loading: S },
);
const SugerenciasIAModule = dynamic(
  () => import("@/components/admin/unified/SugerenciasIAModule"),
  { loading: S },
);
const MetasLogrosModule = dynamic(
  () => import("@/components/admin/unified/MetasLogrosModule"),
  { loading: S },
);
// AIHealthPanel movido a superadmin

const MODULE_ID = "asistente-ia";

const TABS = [
  { id: "centro-comando", label: "Centro de Comando", icon: Stethoscope },
  { id: "sugerencias", label: "Sugerencias", icon: Lightbulb },
  { id: "metas", label: "Metas y Logros", icon: Target },
  { id: "chat-ia", label: "Chat", icon: MessageSquare },
];

export default function AsistenteIAModule() {
  const [tab, setTab] = useState("centro-comando");

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Asistente IA"
        description="Panel de inteligencia artificial: dashboard, sugerencias y metas"
        icon={Brain}
      />
      {/* AI Status Banner removed — moved to superadmin */}

      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        moduleId={MODULE_ID}
      >
      {tab === "centro-comando" && <AICommandCenter />}
      {tab === "sugerencias" && <SugerenciasIAModule />}
      {tab === "metas" && <MetasLogrosModule />}
      {tab === "chat-ia" && (
        <div className="bg-white rounded-2xl border border-gray-200 min-h-[600px] h-[calc(100vh-220px)]">
          <AIAssistant embedded />
        </div>
      )}
      {/* alertas, salud-ia, config-ia movidos a superadmin */}
      </AdminTabBar>
    </div>
  );
}
