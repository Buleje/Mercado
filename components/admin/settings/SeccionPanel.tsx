import { useState } from "react";
import dynamic from "next/dynamic";
import { Layers, ChevronRight } from "@buleje/design-system/icons";
import { Plegable } from "@/components/admin/settings/campos";
import { LINK_A_OTRA_PANTALLA } from "@/components/admin/settings/enlaces";
import { AccesosDirectos, type AccesoDirecto } from "@/components/admin/settings/AccesosDirectos";

const NavDefaultTabsConfig = dynamic(
  () => import("@/components/admin/NavDefaultTabsConfig").then((m) => ({ default: m.NavDefaultTabsConfig })),
);
const SidebarReorderPanel = dynamic(() => import("@/components/admin/SidebarReorderPanel"));

// Categoría visible para el panel "Reordenar barra lateral".
// Compat con CategoryItem de components/admin/SidebarReorderPanel.tsx.
export type ReorderCategory = { id: string; label: string };

export function SeccionPanel({ reorderCategories, onSaveSidebarOrder }: {
  /** Categorías visibles para el panel "Reordenar barra lateral" (opcional). */
  reorderCategories?: ReorderCategory[];
  /** Callback al guardar el nuevo orden del sidebar. */
  onSaveSidebarOrder?: (categoryIds: string[]) => void;
}) {
  // Custom shortcuts for sidebar
  const [customShortcuts, setCustomShortcuts] = useState<AccesoDirecto[]>(() => {
    try {
      const saved = localStorage.getItem("admin_custom_shortcuts");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const renderSidebarOrder = () => {
    if (!reorderCategories || !onSaveSidebarOrder) {
      return (
        <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">El reorden de la barra lateral no está disponible en este contexto.</p>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <SidebarReorderPanel categories={reorderCategories} onSave={onSaveSidebarOrder} />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("open-module-manager"))} className={LINK_A_OTRA_PANTALLA}>
        <Layers className="h-4 w-4 text-primary shrink-0" />
        <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--text-primary)]">Activar u ocultar módulos</span>
        <span className="text-xs text-[var(--text-secondary)]">también limpia datos de ejemplo</span>
        <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
      </button>
      <Plegable clave="pestana-defecto" titulo="Pestaña por defecto" resumen="Qué vista se abre al entrar a cada sección">
        <NavDefaultTabsConfig />
      </Plegable>
      <Plegable clave="barra-lateral" titulo="Orden de la barra lateral" resumen={`${reorderCategories?.length ?? 0} categorías`}>
        {renderSidebarOrder()}
      </Plegable>
      <Plegable clave="accesos-directos" titulo="Accesos directos" resumen={`${customShortcuts.length} de 6 · aparecen como favoritos en tu barra lateral`}>
        {<AccesosDirectos customShortcuts={customShortcuts} setCustomShortcuts={setCustomShortcuts} />}
      </Plegable>
    </div>
  );
}
