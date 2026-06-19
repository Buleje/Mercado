"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Palette, Globe } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Hub de Mi Tienda (consolidación 2→1) ─────────────────────────────────────
// Antes: 2 entradas top-level (store-customizer, pagina-inicio) — confusas entre
// sí (el propio MODULE_INFO lo admitía). Ahora 1 centro de personalización con
// 2 sub-tabs. El header "Mi Tienda" se muestra SIEMPRE arriba (coherencia admin,
// Brandon 2026-06-19); cada módulo conserva su sub-header debajo.
const StoreCustomizer    = dynamic(() => import("@/components/admin/StoreCustomizer"),  { loading: S });
const StorePageAdminPage = dynamic(() => import("@/app/admin/store-page/page"),         { loading: S });

const MODULE_ID = "mi-tienda-hub";

const TABS = [
  { id: "identidad", label: "Identidad y tema",  icon: Palette },
  { id: "pagina",    label: "Mi tienda pública", icon: Globe },
];

export default function MiTiendaHubModule({ initialTab }: { initialTab?: string } = {}) {
  const [sub, setSub] = useState(() => {
    if (initialTab) return initialTab;
    if (typeof window === "undefined") return TABS[0].id;
    return localStorage.getItem(`admin-last-tab-${MODULE_ID}`) || TABS[0].id;
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        eyebrow="Tienda · Personalización"
        title="Mi Tienda"
        description="Diseña la identidad visual y la página pública de tu tienda online."
        icon={Palette}
      />
      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "identidad" && <StoreCustomizer />}
        {sub === "pagina" && <StorePageAdminPage />}
      </AdminTabBar>
    </div>
  );
}
