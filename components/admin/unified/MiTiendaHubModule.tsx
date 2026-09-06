"use client";

import dynamic from "next/dynamic";
import { Palette, Globe } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
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

/** Los ids, estables: el hook los usa como dependencia. */
const TAB_IDS = TABS.map((t) => t.id);

export default function MiTiendaHubModule({ initialTab }: { initialTab?: string } = {}) {
  // La sub-vista vive en `?vista=`: así se comparte por link, el botón «atrás»
  // la recorre y el buscador global puede mandar directo acá. `initialTab` gana
  // cuando el módulo se abre desde un tab alias (ver useVistaModulo).
  const { vista: sub, irA: setSub } = useVistaModulo(MODULE_ID, TAB_IDS, TAB_IDS[0], initialTab);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        eyebrow="Tienda · Personalización"
        title="Mi Tienda"
        description="Identidad, tema y contenido de tu tienda pública."
        icon={Palette}
      />
      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "identidad" && <StoreCustomizer />}
        {sub === "pagina" && <StorePageAdminPage />}
      </AdminTabBar>
    </div>
  );
}
