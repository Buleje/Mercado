"use client";

/**
 * LothMapaMarco — la tarjeta del mapa: la barra única arriba, los paneles de
 * la herramienta que esté prendida, el mapa grande y, encima de él, la
 * leyenda, la escala y las barras de lo que se esté dibujando.
 *
 * En pantalla completa se va entera —barra incluida—: antes sólo se agrandaba
 * el mapa y las herramientas quedaban abajo, fuera de la vista.
 */

import { forwardRef, memo } from "react";
import { Camera, MapPin } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { arbolesEnFaja } from "@/lib/forestal/loth-faja";
import LothMapaCanvasRaw from "./LothMapaCanvas";
import LothMapaChrome from "./LothMapaChrome";
import LothMapaToolbar from "./LothMapaToolbar";
import LothMapaHerramientas from "./LothMapaHerramientas";
import LothCampoBar from "./LothCampoBar";
import LothMapaDrawBar, { LothMapaMarcaBar, LothMapaViaBar } from "./LothMapaDrawBar";
import LothMapaArbolFicha from "./LothMapaArbolFicha";
import LothMapaCensoBarra from "./LothMapaCensoBarra";
import LothMapaEtapasBarra from "./LothMapaEtapasBarra";
import LothMapaCercanos from "./LothMapaCercanos";
import LothMapaElegirVariosBar from "./LothMapaElegirVariosBar";
import LothMapaPlanPanel from "./LothMapaPlanPanel";
import LothMapaAvisoParcela from "./LothMapaAvisoParcela";
import { censoLejosDeLaParcela, leyendaDelPlan } from "./loth-mapa-plan";
import { useLothMapaEscape } from "./hooks/use-loth-mapa-escape";
import type { LothPlanificador } from "./hooks/use-loth-planificador";
import { CLASE_ARBOL_LABEL } from "@/lib/forestal/loth-mapa-arboles";
import { pointInPolygon } from "@/lib/forestal/loth-geo";
import type { LothMapaArboles } from "./hooks/use-loth-mapa-arboles";
import type { LothMapaTalaVarios } from "./hooks/use-loth-mapa-tala-varios";
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
  /** El censo en el mapa: filtro, árbol elegido y «¿Qué árbol tengo cerca?». */
  arb: LothMapaArboles;
  /** «Elegir varios»: marcar árboles en pie para talarlos en una sola planilla. */
  variosTala: LothMapaTalaVarios;
  onTalarVarios?: () => void;
  /** Cuántos vértices muestra el cuadro de coordenadas (borrador incluido). */
  verticesCuadro: number;
  /** El planificador de extracción: su panel, sus capas y la de ríos y caminos. */
  plan: LothPlanificador;
}

const LothMapaMarco = forwardRef<HTMLElement, Props>(function LothMapaMarco({ datos, dib, herr, der, exp, arb, variosTala, onTalarVarios, verticesCuadro, plan }, ref) {
  const { fullscreen, setFullscreen } = herr;
  const rios = datos.carto.vias.filter((v) => v.tipo === "rio");
  /** Una herramienta usa el clic del mapa: los árboles no lo toman y la ficha se guarda. */
  const capturando = dib.drawMode || dib.markMode || dib.viaDraft !== null || herr.medicion !== null;
  const elegido = arb.elegido;
  /** En «Elegir varios» tocar un árbol lo marca; no abre su ficha. */
  const onArbolTocado = variosTala.activo ? (id: string | null) => (id ? variosTala.alternar(id) : undefined) : arb.elegir;

  useLothMapaEscape({ eligiendoVarios: variosTala.activo, salirDeVarios: variosTala.desactivar, fullscreen, setFullscreen });
  /** La leyenda: la del mapa con las etapas del libro justo después de las condiciones del censo, y al final lo del planificador. */
  const finCenso = der.legendItems.reduce((ult, it, i) => (it.shape === "arbol" ? i + 1 : ult), 0);
  const leyenda = [
    ...(herr.showCenso ? [...der.legendItems.slice(0, finCenso), ...arb.leyendaEtapas, ...der.legendItems.slice(finCenso)] : der.legendItems),
    ...leyendaDelPlan({ osm: plan.osmVisible ? plan.geo : null, propuesta: plan.vistaPrevia }),
  ];
  /** La mayoría del censo fuera del área dibujada (Blas: los 65, a 31 km). */
  const lejos = der.declarada ? censoLejosDeLaParcela(der.censoAll, datos.parcela.vertices) : null;
  /** Lo que el filtro deja buscar, dicho como lo lee el monteador («Catahua · Semillero»). */
  const filtrando =
    [arb.opciones.especies.find((o) => o.valor === arb.filtro.especie)?.label, arb.filtro.clase && CLASE_ARBOL_LABEL[arb.filtro.clase]]
      .filter(Boolean)
      .join(" · ") || null;

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
        capas={menuCapas(herr, der, { modo: arb.etiquetas, cambiar: arb.setEtiquetas }, { activo: plan.mostrarOsm, cargando: plan.geoCargando, alternar: () => plan.setMostrarOsm((v) => !v) })}
        dibujar={menuDibujar(dib, datos, der)}
        dibujando={dib.drawMode || dib.viaDraft !== null || dib.markMode}
        herramientas={herramientasDelMapa(herr, rios.length)}
        exportar={menuExportar(exp, der, herr, verticesCuadro)}
        fullscreen={fullscreen}
        onFullscreen={() => setFullscreen((v) => !v)}
        sinGuardar={datos.cartoSinGuardar}
        guardando={datos.savingCarto}
        onGuardar={() => void datos.guardarCartografia()}
        planificar={{ activo: plan.abierto, onToggle: () => plan.setAbierto((v) => !v) }}
        variosTala={{
          disponible: der.censoAll.length > 0 && !capturando,
          activo: variosTala.activo,
          n: variosTala.lista.length,
          onToggle: () => (variosTala.activo ? variosTala.desactivar() : variosTala.activar()),
        }}
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

      {lejos && <LothMapaAvisoParcela fuera={lejos.fuera} total={lejos.total} km={lejos.km} onVer={() => arb.encuadrar(lejos.puntos)} />}

      <div className={fullscreen ? "relative min-h-0 flex-1" : "relative h-[560px] max-sm:h-[420px]"}>
        <LothMapaCanvas
          geo={der.geoShown}
          censo={herr.showCenso ? arb.visibles : []}
          predio={datos.carto.predio.vertices}
          referencias={datos.carto.referencias}
          markMode={dib.markMode}
          onMarkReferencia={dib.marcarReferencia}
          vias={datos.carto.vias}
          viaDraft={dib.viaDraft}
          onViaPoint={dib.addViaPoint}
          overlays={herr.overlays}
          posicion={herr.posicion ?? arb.posicion}
          wayback={herr.wayback}
          waybackSplit={herr.waybackSplit}
          medicion={herr.medicion}
          medicionModo={herr.medicionModo}
          onMedicionPunto={herr.addMedicionPunto}
          fullscreen={fullscreen}
          fajaAnchoM={herr.fajaAnchoM}
          centrarEn={herr.centrarEn}
          encuadrarEn={arb.encuadrarEn}
          arbolElegido={elegido?.id ?? null}
          arbolCercano={arb.cercanoId}
          onArbolElegido={onArbolTocado}
          marcados={variosTala.marcados}
          etiquetas={arb.etiquetas}
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
          geoOsm={plan.osmVisible ? plan.geo : null}
          propuesta={plan.vistaPrevia}
          onPatioMovido={plan.moverPatio}
        />
        <LothMapaChrome items={leyenda} cursor={herr.cursor} metersPerPixel={herr.metersPerPixel} panelDerecha={plan.abierto} />

        {elegido && herr.showCenso && !capturando && !variosTala.activo && (
          <LothMapaArbolFicha
            arbol={elegido}
            desdeTi={arb.desdeTi}
            fuera={der.declarada && !pointInPolygon([elegido.lat, elegido.lng], datos.parcela.vertices)}
            leyendoLibro={arb.etapas?.cargando ?? false}
            onCerrar={() => arb.elegir(null)}
            onCentrar={() => herr.centrar([elegido.lat, elegido.lng])}
          />
        )}

        {plan.abierto && <LothMapaPlanPanel plan={plan} onCerrar={() => plan.setAbierto(false)} />}

        {variosTala.activo && (
          <LothMapaElegirVariosBar
            n={variosTala.lista.length}
            m3={variosTala.totalM3}
            etiqueta={variosTala.etiqueta}
            aviso={variosTala.aviso}
            onLimpiar={variosTala.limpiar}
            onTalar={() => {
              onTalarVarios?.();
            }}
            onSalir={variosTala.desactivar}
          />
        )}

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

      {der.censoAll.length > 0 && herr.showCenso && <LothMapaCensoBarra arb={arb} total={der.censoAll.length} />}
      {der.censoAll.length > 0 && herr.showCenso && <LothMapaEtapasBarra arb={arb} />}
      {arb.cercaActivo && herr.showCenso && <LothMapaCercanos arb={arb} filtrando={filtrando} />}

      {!fullscreen && der.censoAll.length === 0 && (
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
