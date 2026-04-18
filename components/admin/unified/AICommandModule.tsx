"use client";

import dynamic from "next/dynamic";
import { Brain } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const AICommandCenter = dynamic(
  () => import("@/components/admin/ai-center/AICommandCenter"),
  { loading: S }
);

const _MODULE_ID = "ai-command";

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
