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
 *
 * Plan «panel unificado», ola 2 (2026-10-10): Configuración es el único
 * destino de lo que era el grupo Sistema. «Plan» monta la pantalla entera del
 * plan (`PlanTab`: uso del mes, funcionalidades, dominio, portal y comparar)
 * con el selector de niveles plegado; «Sistema» trae un segundo nivel
 * (`?sub=`: preferencias, velocidad, historial, salud, soporte, actividad,
 * colas). La identidad va en la banda de `AdminTabBar` (contrato de diseño):
 * título, ⓘ y el buscador en una fila, sin pestañas —el menú de la izquierda
 * hace de primer nivel—.
 *
 * 11-10 (patrón del panel): sin «Guardar cambios» de ancho completo al final
 * de cada sección; la `BarraCambios` aparece abajo sólo cuando hay cambios
 * (sigue a la vista al cambiar de sección, con un punto en el menú) y manda
 * sólo los campos que cambiaron. Datos del negocio suma «Tu ticket» (pie del
 * ticket, `invoiceFooterText`). Antes se pedía `/api/settings` dos veces al
 * montar (este módulo y `useAjustes`); ahora sólo el hook.
 */
import { useCallback, useId, useMemo, useState } from "react";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { m, AnimatePresence } from "@/components/admin/providers";
import { DURATION, EASE } from "@/components/ui-system/motion";
import { button } from "@/components/ui-system/button-variants";
import type { StoreMode } from "@/lib/jsondb";
import dynamic from "next/dynamic";
import { AlertTriangle, SlidersHorizontal } from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import Plegable from "@/components/admin/shared/Plegable";
import { PermisoDe } from "@/components/admin/shared/PermisoDe";
import { TABS, IDS_AJUSTES, filtrarSecciones, type SeccionAjustes } from "@/components/admin/settings/secciones";
import { MenuSeccionesMovil, MenuSeccionesEscritorio, CabeceraSeccion, BuscadorAjustes } from "@/components/admin/settings/navegacion";
import { useAjustes } from "@/components/admin/settings/use-ajustes";
import { BarraCambios } from "@/components/admin/settings/BarraCambios";
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
const PlanTab = dynamic(() => import("@/components/admin/PlanTab"), { ssr: false });
const SistemaSubvistas = dynamic(() => import("@/components/admin/sistema/SistemaSubvistas"), { ssr: false });

const MODULE_ID = "config";

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
  const aj = useAjustes(storeMode);
  const { loading, cargaFallida, cargar, pendientes, faltanPorSeccion, irAFalta } = aj;
  // «Guardar cambios» de la barra: manda sólo lo que cambió; si cambió el modo, el panel lo sigue.
  const guardarCambios = useCallback(async () => {
    const enviado = await aj.guardar();
    if (enviado && (enviado.mode === "whatsapp" || enviado.mode === "checkout")) onModeChange(enviado.mode);
  }, [aj, onModeChange]);
  const [searchQuery, setSearchQuery] = useState("");
  const encontradas = useMemo(() => filtrarSecciones(searchQuery), [searchQuery]);
  const irASeccion = useCallback((id: SeccionAjustes) => { irAVista(id); setSearchQuery(""); }, [irAVista]);
  const tituloSeccionId = useId();

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
        <p className="flex items-center gap-2 text-sm font-bold text-[var(--data-error-ink)]">
          <AlertTriangle className="h-4 w-4 shrink-0" /> No se pudo cargar tu configuración
        </p>
        <p className="text-sm text-[var(--text-secondary)]">Para no guardar vacío encima de tus datos, esta sección queda bloqueada hasta que cargue.</p>
        <button type="button" onClick={cargar} className={button({ variant: "secondary", className: "rounded-xl" })}>
          Reintentar
        </button>
      </div>
    );
    switch (activeSection) {
      case "negocio": return <SeccionNegocio aj={aj} />;
      case "cobros": return <SeccionCobros aj={aj} onNavigateTab={onNavigateTab} />;
      case "delivery": return <SeccionDelivery aj={aj} />;
      case "tienda": return <SeccionTienda aj={aj} />;
      case "plan": return (
        <div className="space-y-6">
          {/* Lo que abría `?tab=plan`: se ve para quien lo veía ahí (R2). */}
          <PermisoDe origen="plan">
            <PlanTab />
          </PermisoDe>
          {/* Hay dos catálogos de planes (lib/plans y lib/billing/plan-tiers):
              no se borra ninguno, decide Brandon. Éste es el de los niveles
              que desbloquean pestañas. */}
          <Plegable clave="ajustes-plegable-plan-niveles" titulo="Qué incluye cada nivel" resumen="Básico, Pro, Enterprise y Max: qué pestañas desbloquea cada uno">
            <PlanTierSelector />
          </Plegable>
        </div>
      );
      case "equipo": return <SeccionEquipo aj={aj} onNavigateTab={onNavigateTab} />;
      case "panel": return <SeccionPanel reorderCategories={reorderCategories} onSaveSidebarOrder={onSaveSidebarOrder} />;
      case "sistema": return (
        <SistemaSubvistas
          preferencias={<SeccionSistema aj={aj} onResetTutorial={onResetTutorial} onNavigateTab={onNavigateTab} />}
        />
      );
    }
  };

  const meta = TABS.find((s) => s.id === activeSection) ?? TABS[0];

  // ══════════════════════════════════════════════════════════════════════════════
  // LAYOUT — menú agrupado a la izquierda (fila deslizable en el celular)
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-5">
      {/* Banda de identidad sin pestañas: el `:empty` esconde el riel vacío.
          En una caja: la barra devuelve dos hermanos (banda + panel vacío) y
          el `space-y` del padre les daría aire de más. */}
      <div>
        <AdminTabBar
          heading={{
            title: "Configuración",
            description: "Tu negocio, cobros, delivery, tienda, plan, usuarios, tu panel y el sistema",
            icon: SlidersHorizontal,
            actions: (
              <BuscadorAjustes
                valor={searchQuery}
                onCambiar={setSearchQuery}
                onIrAPrimera={() => { if (encontradas[0]) irASeccion(encontradas[0].id); }}
              />
            ),
          }}
          tabs={[]}
          activeTab={activeSection}
          onTabChange={(id) => irASeccion(id as SeccionAjustes)}
          moduleId={MODULE_ID}
          className="[&_[role=tablist]:empty]:hidden"
        />
      </div>

      <MenuSeccionesMovil secciones={encontradas} activa={activeSection} pendientes={pendientes} onIr={irASeccion} conCambios={aj.seccionesConCambios} />

      {encontradas.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">Ningún ajuste coincide con «{searchQuery}».</p>
      )}

      <div className="lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-6 lg:items-start">
        <MenuSeccionesEscritorio secciones={encontradas} activa={activeSection} pendientes={pendientes} onIr={irASeccion} conCambios={aj.seccionesConCambios} />

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
              transition={{ duration: DURATION.fast, ease: EASE.editorial }}
            >
              {renderSection()}
            </m.div>
          </AnimatePresence>
          <BarraCambios secciones={aj.seccionesConCambios} guardando={aj.saving} onGuardar={guardarCambios} onDescartar={aj.descartar} />
        </section>
      </div>


      <ModalUbicacion aj={aj} />
    </div>
  );
}
