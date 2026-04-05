"use client";

import dynamic from "next/dynamic";
import { Brain } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const AICommandCenter = dynamic(
  () => import("@/components/admin/ai-center/AICommandCenter"),
  { loading: S }
);

const MODULE_ID = "ai-command";

export default function AICommandModule() {
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Centro de Comando IA"
        description="Ejecuta comandos de inteligencia artificial para tu bodega"
        icon={Brain}
      />
      <AICommandCenter />
    </div>
  );
}
