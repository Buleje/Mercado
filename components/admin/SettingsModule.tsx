"use client";
/**
 * Configuración (`?tab=config&vista=<sección>`).
 *
 * Auditoría 2026-10-04: eran 20 tarjetas con 91 campos; 36 se guardaban sin
 * que nada del sistema los leyera (series y redondeo de comprobantes, todo
 * Inventario, SMTP, Google Analytics, retención de logs, horarios y
 * repartidores de delivery…), «Restaurar respaldo» siempre fallaba, «Cambiar
 * contraseña» comparaba contra «••••••» y los «Feature Flags» pintaban el
 * envoltorio de la respuesta y guardaban contra un PATCH que no existe. Quedan 8 secciones en un menú
 * agrupado; las columnas siguen en la base (no se borró ningún dato).
 * Las secciones y su buscador: `settings/secciones.ts`.
 */
import { useEffect, useCallback, useId, useMemo, useState } from "react";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { m, AnimatePresence } from "@/components/admin/providers";
import type { StoreMode } from "@/lib/jsondb";
import dynamic from "next/dynamic";
import { AlertTriangle, SlidersHorizontal, Search, X } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { TABS, IDS_AJUSTES, filtrarSecciones, type SeccionAjustes } from "@/components/admin/settings/secciones";
import { MenuSeccionesMovil, MenuSeccionesEscritorio, CabeceraSeccion } from "@/components/admin/settings/navegacion";
import { useAjustes } from "@/components/admin/settings/use-ajustes";
import { ModalUbicacion } from "@/components/admin/settings/ModalUbicacion";
import { SeccionNegocio } from "@/components/admin/settings/SeccionNegocio";
import { SeccionCobros } from "@/components/admin/settings/SeccionCobros";
import { SeccionDelivery } from "@/components/admin/settings/SeccionDelivery";
import { SeccionTienda } from "@/components/admin/settings/SeccionTienda";
import { SeccionEquipo } from "@/components/admin/settings/SeccionEquipo";
import { SeccionPanel, type ReorderCategory } from "@/components/admin/settings/SeccionPanel";
import { SeccionSistema } from "@/components/admin/settings/SeccionSistema";

const PlanTierSelector = dynamic(
  () => import("@/components/admin/PlanTierSelector"),
  { ssr: false },
);

// Secciones que se llenan con /api/settings (Plan, Equipo, Mi panel y Sistema traen lo suyo).
const SECCIONES_CON_DATOS: ReadonlySet<SeccionAjustes> = new Set(["negocio", "cobros", "delivery", "tienda"]);

interface SettingsModuleProps {
  storeMode: StoreMode;
  onModeChange: (m: StoreMode) => void;
  /** Categorías visibles para el panel "Reordenar barra lateral" (opcional). */
  reorderCategories?: ReorderCategory[];
  /** Callback al guardar el nuevo orden del sidebar. */
  onSaveSidebarOrder?: (categoryIds: string[]) => void;
  /** Callback al click "Repetir tutorial" — reset del onboarding tour. */
  onResetTutorial?: () => void;
  /** Callback para navegar a otro tab (ej. al iniciar tutorial). */
  onNavigateTab?: (tab: string) => void;
}

export default function SettingsModule({
  storeMode,
  onModeChange,
  reorderCategories,
  onSaveSidebarOrder,
  onResetTutorial,
  onNavigateTab,
}: SettingsModuleProps) {
  const { vista: activeSection, irA: irAVista } = useVistaModulo<SeccionAjustes>("config", IDS_AJUSTES, "negocio");
  const aj = useAjustes(storeMode, activeSection);
  const { loading, cargaFallida, cargar, pendientes, faltanPorSeccion, irAFalta } = aj;
  const [searchQuery, setSearchQuery] = useState("");
  const encontradas = useMemo(() => filtrarSecciones(searchQuery), [searchQuery]);
  const irASeccion = useCallback((id: SeccionAjustes) => { irAVista(id); setSearchQuery(""); }, [irAVista]);
  const tituloSeccionId = useId();

  useEffect(() => { cargar(); }, [cargar]);

  // ── Render loading state ────────────────────────────────────────────────────

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-6">
          <div className="flex items-center gap-4"><div className="h-12 w-12 bg-[var(--rule-base)] rounded-xl" /><div className="flex-1 space-y-2"><div className="h-5 bg-[var(--rule-base)] rounded w-1/3" /><div className="h-3 bg-[var(--rule-base)] rounded w-2/3" /></div></div>
        </div>
      ))}
    </div>
  );

  const renderSection = () => {
    if (cargaFallida && SECCIONES_CON_DATOS.has(activeSection)) return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-[var(--data-error-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" /> No se pudo cargar tu configuración
        </p>
        <p className="text-xs text-[var(--text-secondary)]">Para no guardar vacío encima de tus datos, esta sección queda bloqueada hasta que cargue.</p>
        <button type="button" onClick={cargar} className="inline-flex items-center gap-2 px-4 min-h-11 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90">
          Reintentar
        </button>
      </div>
    );
    switch (activeSection) {
      case "negocio": return <SeccionNegocio aj={aj} onModeChange={onModeChange} />;
      case "cobros": return <SeccionCobros aj={aj} onNavigateTab={onNavigateTab} />;
      case "delivery": return <SeccionDelivery aj={aj} />;
      case "tienda": return <SeccionTienda aj={aj} />;
      case "plan": return <PlanTierSelector />;
      case "equipo": return <SeccionEquipo aj={aj} onNavigateTab={onNavigateTab} />;
      case "panel": return <SeccionPanel reorderCategories={reorderCategories} onSaveSidebarOrder={onSaveSidebarOrder} />;
      case "sistema": return <SeccionSistema aj={aj} onResetTutorial={onResetTutorial} onNavigateTab={onNavigateTab} />;
    }
  };

  const meta = TABS.find((s) => s.id === activeSection) ?? TABS[0];

  // ══════════════════════════════════════════════════════════════════════════════
  // LAYOUT — menú agrupado a la izquierda (fila deslizable en el celular)
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-5">
      <AdminModuleHeader
        title="Configuración"
        description="Tu negocio, cobros, tienda y panel"
        icon={SlidersHorizontal}
        bgTint="bg-[var(--surface-sunken)] "
        iconColorClass="text-[var(--text-secondary)] "
      >
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            aria-label="Buscar un ajuste"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && encontradas[0]) irASeccion(encontradas[0].id); }}
            placeholder="Buscar: yape, igv, logo…"
            className="w-full pl-9 pr-9 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
          {searchQuery && (
            <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </AdminModuleHeader>

      <MenuSeccionesMovil secciones={encontradas} activa={activeSection} pendientes={pendientes} onIr={irASeccion} />

      {encontradas.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">Ningún ajuste coincide con «{searchQuery}».</p>
      )}

      <div className="lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-6 lg:items-start">
        <MenuSeccionesEscritorio secciones={encontradas} activa={activeSection} pendientes={pendientes} onIr={irASeccion} />

        <section aria-labelledby={tituloSeccionId} className="min-w-0 mt-4 lg:mt-0">
          <CabeceraSeccion
            meta={meta}
            tituloId={tituloSeccionId}
            faltan={cargaFallida && SECCIONES_CON_DATOS.has(activeSection) ? [] : (faltanPorSeccion[activeSection] ?? [])}
            onIrACampo={irAFalta}
          />
          <AnimatePresence mode="wait">
            <m.div
              key={activeSection}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              {renderSection()}
            </m.div>
          </AnimatePresence>
        </section>
      </div>


      <ModalUbicacion aj={aj} />
    </div>
  );
}
