"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Gauge, Shield, Activity } from "@buleje/design-system/icons";
import AdminBreadcrumb from "@/components/admin/shared/AdminBreadcrumb";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Hub de Sistema (consolidación 3→1) ───────────────────────────────────────
// Antes: 3 entradas top-level sueltas (rendimiento, auditoria, colas). Ahora 1
// centro técnico con 3 sub-tabs. El header "Sistema" se muestra SIEMPRE arriba
// (coherencia admin, Brandon 2026-06-19) — los sub-módulos con header propio
// quedan debajo dando jerarquía "Sistema → <sección>".
const RendimientoModule = dynamic(() => import("@/components/admin/unified/RendimientoModule"), { loading: S });
const AuditTab          = dynamic(() => import("@/components/admin/tabs/AuditTab"),             { loading: S });
const ColasTab          = dynamic(() => import("@/components/admin/ColasTab"),                  { loading: S });

const MODULE_ID = "sistema-hub";

const TABS = [
  { id: "rendimiento", label: "Rendimiento", icon: Gauge },
  { id: "auditoria",   label: "Auditoría",   icon: Shield },
  { id: "colas",       label: "Colas",       icon: Activity },
];

export default function SistemaHubModule({ initialTab }: { initialTab?: string } = {}) {
  const [sub, setSub] = useState(() => {
    if (initialTab) return initialTab;
    if (typeof window === "undefined") return TABS[0].id;
    return localStorage.getItem(`admin-last-tab-${MODULE_ID}`) || TABS[0].id;
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);

  return (
    <div className="space-y-4">
      <AdminBreadcrumb
        items={[
          { label: "Sistema", onClick: () => setSub(TABS[0].id) },
          { label: TABS.find((t) => t.id === sub)?.label ?? "" },
        ]}
      />
      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "rendimiento" && <RendimientoModule />}
        {sub === "auditoria" && <AuditTab />}
        {sub === "colas" && <ColasTab />}
      </AdminTabBar>
    </div>
  );
}
