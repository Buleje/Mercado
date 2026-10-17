"use client";

/**
 * Recetas: producción interna con control de costos. Tres secciones en la
 * barra (`?vista=`): Recetas (lista + «Producir»), Producción (lo producido) y
 * Recetario web (las recetas públicas de la tienda). La vista vieja «Resumen»
 * (`dashboard`) se fundió en Producción: sus cifras viven en Indicadores.
 */
import React, { useEffect, useState } from "react";
import { BookOpen, FlaskConical, MoreHorizontal, Plus, RefreshCw } from "@buleje/design-system/icons";
import { LoadingState } from "@buleje/design-system";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { escapeDeLaPaginaConFijado } from "@/hooks/use-ventana-de-modal";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import ActionMenu from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { ListaRecetas } from "@/components/admin/recetas/ListaRecetas";
import { ModalNuevaReceta } from "@/components/admin/recetas/ModalNuevaReceta";
import { ModalProducir } from "@/components/admin/recetas/ModalProducir";
import { PanelDetalleReceta } from "@/components/admin/recetas/PanelDetalleReceta";
import { VistaProduccion } from "@/components/admin/recetas/VistaProduccion";
import { useDetalleReceta } from "@/components/admin/recetas/use-detalle-receta";
import { useIndicadoresProduccion, useIndicadoresRecetas } from "@/components/admin/recetas/use-indicadores-recetas";
import { useRecetasDatos } from "@/components/admin/recetas/use-recetas-datos";
import type { Receta } from "@/components/admin/recetas/tipos";

const RecetarioAdminTab = React.lazy(() => import("@/components/admin/recetas/RecetarioAdminTab"));

/** Las vistas del módulo, estables: el hook las usa como dependencia. «dashboard» es la vieja (se muestra como Producción). */
const RECETAS_VISTAS = ["recetas", "produccion", "recetario"] as const;

const MODULE_ID = "recetas";
const TAB_ITEMS = [
  { id: "recetas", label: "Recetas" },
  { id: "produccion", label: "Producción" },
  { id: "recetario", label: "Recetario Web", icon: BookOpen },
];

export default function RecetasModule() {
  // La sub-vista vive en `?vista=`: link compartible, atrás del navegador y destino del buscador global.
  // `?vista=dashboard` (el Resumen que se fundió en Producción) sigue llegando a Producción.
  const { vista, irA } = useVistaModulo(MODULE_ID, RECETAS_VISTAS, RECETAS_VISTAS[0], undefined, { alias: { dashboard: "produccion" } });
  const activeTab = vista;

  const { recetas, productos, lotes, loading, error, recargar } = useRecetasDatos();
  const { detalle, costData, costLoading, abrir, cerrar } = useDetalleReceta();
  const [showNew, setShowNew] = useState(false);
  const [aProducir, setAProducir] = useState<Receta | null>(null);

  const kpisRecetas = useIndicadoresRecetas(recetas, productos, loading && recetas.length === 0);
  const kpisProduccion = useIndicadoresProduccion(lotes, loading && lotes.length === 0);
  const kpis = activeTab === "recetas" ? kpisRecetas : activeTab === "produccion" ? kpisProduccion : null;

  // Escape: cierra primero lo de más arriba (producir > nueva > detalle). Con un modal fijado, el Escape es de la página (ADR-420).
  useEffect(() => {
    const alEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || escapeDeLaPaginaConFijado()) return;
      if (aProducir) setAProducir(null);
      else if (showNew) setShowNew(false);
      else if (detalle) cerrar();
    };
    document.addEventListener("keydown", alEscape);
    return () => document.removeEventListener("keydown", alEscape);
  }, [aProducir, showNew, detalle, cerrar]);

  return (
    <div className="space-y-4">
      {/* Título, secciones, Indicadores, acción principal y «Más» en la misma banda. */}
      <AdminTabBar
        heading={{
          title: "Recetas",
          description: "Producción interna con control de costos e ingredientes.",
          icon: FlaskConical,
          actions: (
            <>
              {kpis?.boton}
              {activeTab === "recetas" && (
                <button type="button" onClick={() => setShowNew(true)} className={button({ variant: "primary", className: "gap-2 rounded-xl" })}>
                  <Plus className="h-4 w-4" aria-hidden /> Nueva receta
                </button>
              )}
              {activeTab !== "recetario" && (
                <ActionMenu
                  label="Más"
                  icon={MoreHorizontal}
                  soloIcono
                  size="md"
                  className="w-12 shrink-0"
                  title="Actualizar"
                  actions={[{ id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: recargar }]}
                />
              )}
            </>
          ),
        }}
        moduleId={MODULE_ID}
        tabs={TAB_ITEMS}
        activeTab={activeTab}
        onTabChange={(id) => irA(id as (typeof RECETAS_VISTAS)[number])}
      />

      {kpis?.panel}

      {activeTab === "recetas" && (
        <ListaRecetas
          recetas={recetas}
          productos={productos}
          loading={loading}
          error={error}
          onReintentar={recargar}
          onDetalle={abrir}
          onProducir={setAProducir}
          onNueva={() => setShowNew(true)}
        />
      )}

      {activeTab === "produccion" && <VistaProduccion lotes={lotes} loading={loading} onIrARecetas={() => irA("recetas")} />}

      {activeTab === "recetario" && (
        <React.Suspense fallback={<LoadingState />}>
          <RecetarioAdminTab />
        </React.Suspense>
      )}

      <PanelDetalleReceta receta={detalle} productos={productos} costData={costData} costLoading={costLoading} onCerrar={cerrar} onProducir={setAProducir} />
      <ModalNuevaReceta abierto={showNew} onCerrar={() => setShowNew(false)} onCreada={recargar} />
      <ModalProducir receta={aProducir} productos={productos} onCerrar={() => setAProducir(null)} onProducida={recargar} />
    </div>
  );
}
