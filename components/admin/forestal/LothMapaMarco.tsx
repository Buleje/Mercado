"use client";

/**
 * LothMapaMarco — la tarjeta del mapa: la barra única arriba, los paneles de
 * la herramienta que esté prendida, el mapa grande y, encima de él, la
 * leyenda, la escala y las barras de lo que se esté dibujando.
 *
 * En pantalla completa se va entera —barra incluida—: antes sólo se agrandaba
 * el mapa y las herramientas quedaban abajo, fuera de la vista.
 */

import { forwardRef, memo, useEffect } from "react";
import { Camera, MapPin } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { arbolesEnFaja } from "@/lib/forestal/loth-faja";
import LothMapaCanvasRaw from "./LothMapaCanvas";
import LothMapaChrome from "./LothMapaChrome";
import LothMapaToolbar from "./LothMapaToolbar";
import LothMapaHerramientas from "./LothMapaHerramientas";
import LothCampoBar from "./LothCampoBar";
import LothMapaDrawBar, { LothMapaMarcaBar, LothMapaViaBar } from "./LothMapaDrawBar";
import { herramientasDelMapa, menuCapas, menuDibujar, menuExportar } from "./loth-mapa-menus";
import type { LothMapaDatos } from "./hooks/use-loth-mapa-datos";
import type { LothMapaDibujo } from "./hooks/use-loth-mapa-dibujo";
import type { LothMapaHerramientasEstado } from "./hooks/use-loth-mapa-herramientas";
import type { LothMapaDerivados } from "./hooks/use-loth-mapa-derivados";
import type { LothMapaExportes } from "./hooks/use-loth-mapa-exportes";
import { BRAND_GEO } from "@/lib/geo";
import type { LatLng } from "@/lib/forestal/loth-geo";

/** El canvas re-monta capas por efecto: memo evita repintarlo al mover el mouse. */
const LothMapaCanvas = memo(LothMapaCanvasRaw);
const CENTRO: LatLng = [BRAND_GEO.lat, BRAND_GEO.lng];

interface Props {
  datos: LothMapaDatos;
  dib: LothMapaDibujo;
  herr: LothMapaHerramientasEstado;
  der: LothMapaDerivados;
  exp: LothMapaExportes;
  /** Cuántos vértices muestra el cuadro de coordenadas (borrador incluido). */
  verticesCuadro: number;
}

const LothMapaMarco = forwardRef<HTMLElement, Props>(function LothMapaMarco({ datos, dib, herr, der, exp, verticesCuadro }, ref) {
  const { fullscreen, setFullscreen } = herr;
  const rios = datos.carto.vias.filter((v) => v.tipo === "rio");

  // Escape saca de pantalla completa — salvo que lo haya usado otro (un menú
  // abierto lo marca con `preventDefault`, un diálogo encima lo necesita él).
  // «Encima» = con tamaño: el menú móvil del panel es un `role="dialog"` que
  // vive montado a 0×0 aunque esté cerrado, y contarlo dejaba Escape muerto.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const dialogos = document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]');
      if ([...dialogos].some((d) => d.getBoundingClientRect().width > 0)) return;
      setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, setFullscreen]);

  return (
    <section
      ref={ref}
      aria-label="Mapa del área de aprovechamiento"
      data-mapa-marco
      className={
        fullscreen
          ? "fixed inset-3 z-[55] flex flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
          : "scroll-mt-4 overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
      }
    >
      <LothMapaToolbar
        capas={menuCapas(herr, der)}
        dibujar={menuDibujar(dib, datos, der)}
        dibujando={dib.drawMode || dib.viaDraft !== null || dib.markMode}
        herramientas={herramientasDelMapa(herr, rios.length)}
        exportar={menuExportar(exp, der, herr, verticesCuadro)}
        fullscreen={fullscreen}
        onFullscreen={() => setFullscreen((v) => !v)}
        sinGuardar={datos.cartoSinGuardar}
        guardando={datos.savingCarto}
        onGuardar={() => void datos.guardarCartografia()}
      />

      <LothMapaHerramientas
        medicion={herr.medicion}
        medicionModo={herr.medicionModo}
        onMedicion={herr.setMedicion}
        onMedicionModo={herr.setMedicionModo}
        releases={herr.releases}
        wayback={herr.wayback}
        onWayback={herr.setWayback}
        waybackSplit={herr.waybackSplit}
        onWaybackSplit={herr.setWaybackSplit}
        irOpen={herr.irOpen}
        onIrA={herr.centrar}
        onCerrarIr={() => herr.setIrOpen(false)}
        zonaDefault={der.zonaSugerida}
        fajaAnchoM={herr.fajaAnchoM}
        onFajaAncho={herr.setFajaAnchoM}
        arbolesEnFaja={herr.fajaAnchoM > 0 ? rios.reduce((total, v) => total + arbolesEnFaja(der.censoAll, v.puntos, herr.fajaAnchoM).length, 0) : 0}
        perfil={herr.perfil}
        onCerrarPerfil={herr.cerrarPerfil}
      />

      <LothCampoBar
        activo={herr.campoActivo}
        posicion={herr.posicion}
        parcela={datos.parcela.vertices}
        declarada={der.declarada}
        onPosicion={herr.setPosicion}
        onMarcarAqui={dib.marcarReferencia}
        onCentrar={herr.centrar}
      />

      <div className={fullscreen ? "relative min-h-0 flex-1" : "relative h-[560px] max-sm:h-[420px]"}>
        <LothMapaCanvas
          geo={der.geoShown}
          censo={der.censoShown}
          predio={datos.carto.predio.vertices}
          referencias={datos.carto.referencias}
          markMode={dib.markMode}
          onMarkReferencia={dib.marcarReferencia}
          vias={datos.carto.vias}
          viaDraft={dib.viaDraft}
          onViaPoint={dib.addViaPoint}
          overlays={herr.overlays}
          posicion={herr.posicion}
          wayback={herr.wayback}
          waybackSplit={herr.waybackSplit}
          medicion={herr.medicion}
          medicionModo={herr.medicionModo}
          onMedicionPunto={herr.addMedicionPunto}
          fullscreen={fullscreen}
          fajaAnchoM={herr.fajaAnchoM}
          centrarEn={herr.centrarEn}
          parcela={datos.parcela.vertices}
          declarada={der.declarada}
          draft={dib.draft}
          drawMode={dib.drawMode}
          drawTarget={dib.drawTarget}
          basemap={herr.basemap}
          showGrid={herr.showGrid}
          center={CENTRO}
          fitKey={datos.fitKey}
          onAddVertex={dib.addVertex}
          onMoveVertex={dib.moveVertex}
          onDeleteVertex={dib.deleteVertex}
          onInsertVertex={dib.insertVertex}
          onCursor={herr.onCursor}
          onView={herr.onView}
        />
        <LothMapaChrome items={der.legendItems} cursor={herr.cursor} metersPerPixel={herr.metersPerPixel} />

        {dib.drawMode && (
          <LothMapaDrawBar
            target={dib.drawTarget}
            count={dib.draft.length}
            areaHa={dib.draftAreaHa}
            saving={datos.saving || datos.savingCarto}
            canWrapCenso={der.censoAll.length > 0}
            onWrapCenso={dib.envolverCenso}
            onImportCoords={() => dib.setCoordsOpen("area")}
            onUndo={dib.undoVertex}
            onSave={() => void dib.saveDraw()}
            onCancel={dib.cancelDraw}
          />
        )}
        {dib.viaDraft !== null && (
          <LothMapaViaBar puntos={dib.viaDraft} onUndo={dib.deshacerVia} onTerminar={dib.terminarVia} onCancel={dib.cancelarVia} />
        )}
        {dib.markMode && <LothMapaMarcaBar onCancel={() => dib.setMarkMode(false)} />}

        {/* Estado vacío */}
        {datos.raw !== null && der.totalPuntos === 0 && !der.declarada && !dib.drawMode && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
            <div className="pointer-events-auto max-w-md rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]/95 p-5 text-center shadow-lg backdrop-blur">
              <MapPin className="mx-auto mb-2 h-8 w-8 text-[var(--text-tertiary)]" aria-hidden="true" />
              <p className="flex items-center justify-center gap-1 text-sm font-bold text-[var(--text-primary)]">
                Todavía no hay geolocalización
                <InfoTip
                  title="Cómo se completa el plano"
                  what="Dibuja la parcela de aprovechamiento (Dibujar → Área de aprovechamiento)."
                  affects="Carga el censo con sus coordenadas UTM y captura el GPS al registrar cada tala."
                  example="Los tres alimentan el plano y el cumplimiento EUDR."
                />
              </p>
            </div>
          </div>
        )}
      </div>

      {!fullscreen && (
        <p className="flex items-center gap-1.5 border-t border-[var(--rule-soft)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
          <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Toca un punto del mapa
          <InfoTip
            icono="ayuda"
            title="Tocar un punto del mapa"
            what="Muestra su coordenada UTM, la especie del árbol y la foto de campo, si la tiene."
          />
        </p>
      )}
    </section>
  );
});

export default LothMapaMarco;
