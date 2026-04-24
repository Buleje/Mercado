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
  // 2026-04-24: description removida — los tabs + KPIs + acciones ya
  // comunican el propósito del centro. Consistencia con el resto del
  // admin (Ventas/Caja/Inventario/etc también están sin subtítulo).
  return (
    <div className="space-y-4">
      <AdminModuleHeader title="Centro de Comando IA" icon={Brain} />
      <AICommandCenter />
    </div>
  );
}
