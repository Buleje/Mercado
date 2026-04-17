"use client";

import dynamic from "next/dynamic";
import { MessageSquare } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const MODULE_ID = "chat-ia";

const AIAssistant = dynamic(
  () => import("@/components/admin/AIAssistant"),
  { ssr: false, loading: S },
);

export default function ChatIAModule() {
  void MODULE_ID;
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Chat IA"
        description="Pregúntale cualquier cosa a tu asistente inteligente"
        icon={MessageSquare}
      />
      <div className="bg-white rounded-xl border border-[var(--rule-base)] min-h-[600px] h-[calc(100vh-220px)]">
        <AIAssistant embedded />
      </div>
    </div>
  );
}
