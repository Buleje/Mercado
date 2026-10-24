"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FolderOpen, Star } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";
import {
  armarEsenciales, filtrarEsenciales, masAbiertos, moverEnOrden, ordenarEsenciales, type OrdenEsenciales,
} from "@/lib/documentos/esenciales";
import type { OrdenDocsTercero } from "@/lib/documentos/terceros-vinculo";
import { CargandoVista } from "../archivo/perezosos";
import VistaPreviaArchivo from "../archivo/VistaPreviaArchivo";
import type { ModeloArchivo } from "../archivo/use-archivo";
import type { AccionesTarjeta } from "./TarjetaEsencial";
import TarjetasEsenciales from "./TarjetasEsenciales";
import AvisosEsenciales from "./AvisosEsenciales";
import CompartirEsencialesModal from "./CompartirEsencialesModal";
import { EscanerModal } from "../archivo/perezosos";
import IconoCarpetaModal from "./IconoCarpetaModal";
import PanelEsencial from "./PanelEsencial";
import CajonLateral from "./CajonLateral";
import ElegirCarpetasModal from "./ElegirCarpetasModal";
import { marcarEsenciales } from "./marcar-esencial";
import CabeceraEsenciales from "./CabeceraEsenciales";
import { useUsoDocs } from "./use-uso-docs";
import { useOrdenEsenciales } from "./use-orden-esenciales";
import { useVisorEsenciales } from "./use-visor-esenciales";
import { archivosSoltados, subirACarpeta, traeArchivos } from "./subir-a-carpeta";
import { useColumnaDerecha } from "@/components/admin/layout/columna-derecha";
import { useHuecoLateral } from "./hueco-lateral";
import CarpetaAmplia from "./CarpetaAmplia";
import PapelesEncontrados from "./PapelesEncontrados";
import LeerPapeles from "./LeerPapeles";
import { buscarEnEsenciales } from "@/lib/documentos/esenciales-buscar";
import { PARAM_AMPLIA, PARAM_ESENCIAL, escribirEnLaUrl, leerDeLaUrl, useAnchoDelContenedor } from "./medidas-y-url";

/**
 * Las tarjetas y el panel lado a lado dependen del ancho de la vista, no de la
 * pantalla: a 1280 px de pantalla la vista mide ~960 (dos columnas de tarjetas
 * + el panel de 26rem). Por debajo, el panel se abre encima como cajón.
 */
const ANCHO_CON_PANEL = 820;
/**
 * Con la columna de la derecha del panel (de arriba hasta abajo, 26rem), la
 * pantalla sin la barra izquierda tiene que medir esto para que a la izquierda
 * queden dos tarjetas: a 1280 de pantalla mide 1004 y quedan ~540 para ellas.
 */
const ANCHO_CON_COLUMNA = 960;
/** Por debajo, «Elegir carpetas» queda en ícono para que la cabecera no se parta en dos filas. */
const ANCHO_BOTON_CON_TEXTO = 1100;

/**
 * Documentos › Esenciales (Brandon 23-10): las carpetas que marcaste en el
 * Archivo, grandes y con sus detalles. Sin la barra de vistas del Archivo:
 * acá se elige una carpeta y su contenido se abre en el panel del costado.
 */
export default function VistaEsenciales({ arch, onAbrirEnArchivo }: {
  arch: ModeloArchivo;
  onAbrirEnArchivo: (carpetaId: string | null) => void;
}) {
  const { folders, documents, loading, bulkFolders, updateFolder, upload, preview, setPreview, setSharingFolder, setExpediente, setVinculando, menuDe, refresh } = arch;
  const { uso } = useUsoDocs();
  const manual = useOrdenEsenciales();
  const [ahora] = useState(() => Date.now());
  const [q, setQ] = useState("");
  // Sin elección propia en este equipo, manda el orden del negocio si alguien lo guardó.
  const [ordenElegido, setOrden] = useLocalStorage<OrdenEsenciales | null>("documentos-esenciales-orden", null);
  const orden: OrdenEsenciales = ordenElegido ?? (manual.guardado ? "manual" : "uso");
  // El orden de los papeles del panel vive acá: el visor recorre la carpeta en ese mismo orden.
  const [ordenPapeles, setOrdenPapeles] = useLocalStorage<OrdenDocsTercero>("documentos-esenciales-orden-papeles", "fecha");
  const [elegidaId, setElegidaEstado] = useState<string | null>(() => leerDeLaUrl(PARAM_ESENCIAL));
  const [eligiendo, setEligiendo] = useState(false);
  const [escaneandoEn, setEscaneandoEn] = useState<DbDocumentFolder | null>(null);
  const [iconoDe, setIconoDe] = useState<DbDocumentFolder | null>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  // Dónde se está mirando adentro de la elegida (null = en la misma carpeta esencial).
  const [dentroDe, setDentroDe] = useState<string | null>(null);
  // «Ver en grande» (`?amplia=1`): la carpeta a todo el ancho, con árbol, papeles y detalles.
  const [amplia, setAmpliaEstado] = useState(() => leerDeLaUrl(PARAM_AMPLIA) === "1");
  const setAmplia = useCallback((si: boolean) => {
    setAmpliaEstado(si);
    escribirEnLaUrl(PARAM_AMPLIA, si ? "1" : null);
  }, []);
  const [refVista, ancho] = useAnchoDelContenedor();
  // En Documentos el panel va a la columna de la derecha del panel, de arriba hasta
  // abajo, si la pantalla da (se decide con el ancho libre: el de la vista se achica al abrirlo).
  const lateral = useHuecoLateral();
  const anchoSeccion = useColumnaDerecha()?.anchoLibre ?? 0;
  const acoplado = !!lateral && anchoSeccion >= ANCHO_CON_COLUMNA;
  const conPanel = acoplado || (lateral === undefined && ancho >= ANCHO_CON_PANEL);

  const setElegida = useCallback((id: string | null) => {
    setElegidaEstado(id);
    setDentroDe(null);
    escribirEnLaUrl(PARAM_ESENCIAL, id);
  }, []);
  // Al salir de la pestaña el `?esencial=` no queda colgado en la dirección.
  useEffect(() => () => { escribirEnLaUrl(PARAM_ESENCIAL, null); escribirEnLaUrl(PARAM_AMPLIA, null); }, []);

  const vivos = useMemo(() => documents.filter((d) => !d.deletedAt), [documents]);
  const todas = useMemo(() => armarEsenciales({ carpetas: folders, docs: vivos, uso }), [folders, vivos, uso]);
  const lista = ordenarEsenciales(filtrarEsenciales(todas, q), orden, manual.orden);
  const elegida = todas.find((e) => e.carpeta.id === elegidaId) ?? null;
  const enGrande = amplia && !!elegida;
  const mirando = elegida ? (dentroDe && elegida.carpetaIds.has(dentroDe) ? dentroDe : elegida.carpeta.id) : null;
  // Buscar en TODAS las esenciales (papeles por nombre, etiqueta o texto leído), con su camino.
  const resultados = useMemo(
    () => (q.trim().length >= 2 ? buscarEnEsenciales({ q, esenciales: todas, carpetas: folders, docs: vivos }) : []),
    [q, todas, folders, vivos],
  );
  const cifras = {
    carpetas: todas.length,
    papeles: todas.reduce((n, e) => n + e.docs, 0),
    vencidos: todas.reduce((n, e) => n + e.vencidos, 0),
    porVencer: todas.reduce((n, e) => n + e.porVencer, 0),
  };
  const botonConTexto = todas.length === 0 || ancho === 0 || ancho >= ANCHO_BOTON_CON_TEXTO;
  const destacados = useMemo(() => {
    const ids = new Set(todas.flatMap((e) => [...e.carpetaIds]));
    return masAbiertos(vivos.filter((d) => !!d.folderId && ids.has(d.folderId)), uso, 3);
  }, [todas, vivos, uso]);
  const visor = useVisorEsenciales({ preview, setPreview, elegida, todas, vivos, orden: ordenPapeles });

  // «Mi orden»: siempre sobre TODAS las esenciales (no sólo las que deja ver el buscador).
  const ordenActual = ordenarEsenciales(todas, orden, manual.orden).map((e) => e.carpeta.id);
  const reordenar = (ids: string[]) => {
    setOrden("manual");
    manual.guardar(ids);
  };

  const quitar = (f: DbDocumentFolder) => {
    if (elegidaId === f.id) setElegida(null);
    void marcarEsenciales(bulkFolders, [f], false);
  };
  const acciones: AccionesTarjeta = {
    ver: (f) => setElegida(elegidaId === f.id && conPanel ? null : f.id),
    abrirEnArchivo: (f) => onAbrirEnArchivo(f.id),
    compartir: setSharingFolder,
    expediente: (f) => setExpediente({ tipo: "carpeta", folderId: f.id, nombre: f.name }),
    terceros: setVinculando,
    quitar,
    soltarArchivos: (f, ev) => {
      const { archivos, carpetas } = archivosSoltados(ev);
      void subirACarpeta(upload, archivos, f, carpetas);
    },
    escanear: setEscaneandoEn,
    cambiarIcono: setIconoDe,
    moverAntesDe: (id, antesDe) => reordenar(moverEnOrden(ordenActual, id, antesDe)),
    mover: (f, hacia) => {
      const i = ordenActual.indexOf(f.id);
      const j = i + hacia;
      if (i < 0 || j < 0 || j >= ordenActual.length) return;
      const ids = [...ordenActual];
      [ids[i], ids[j]] = [ids[j], ids[i]];
      reordenar(ids);
    },
  };
  const guardarElegidas = async (poner: DbDocumentFolder[], sacar: DbDocumentFolder[]) => {
    const ok1 = await marcarEsenciales(bulkFolders, poner, true);
    const ok2 = ok1 && (await marcarEsenciales(bulkFolders, sacar, false));
    return ok1 && ok2;
  };

  if (loading && folders.length === 0) return <CargandoVista />;

  const panel = elegida && mirando && !enGrande && (
    <PanelEsencial
      key={elegida.carpeta.id}
      e={elegida}
      dentroDe={mirando}
      setDentroDe={setDentroDe}
      orden={ordenPapeles}
      setOrden={setOrdenPapeles}
      abrir={visor.abrir}
      arch={arch}
      uso={uso}
      ahora={ahora}
      onCerrar={() => setElegida(null)}
      onAbrirEnArchivo={(id) => onAbrirEnArchivo(id)}
      onQuitar={quitar}
      onAmpliar={() => setAmplia(true)}
      onEscanear={setEscaneandoEn}
      onCambiarIcono={setIconoDe}
    />
  );

  return (
    <div
      ref={refVista}
      className="space-y-4"
      data-qa="vista-esenciales"
      data-con-panel={conPanel ? 1 : 0}
      // Un archivo que se suelta fuera de una tarjeta no abre el navegador encima del panel.
      onDragOver={(ev) => { if (traeArchivos(ev)) ev.preventDefault(); }}
      onDrop={(ev) => { if (traeArchivos(ev)) ev.preventDefault(); }}
    >
      <CabeceraEsenciales
        cifras={cifras}
        q={q}
        setQ={setQ}
        orden={orden}
        setOrden={setOrden}
        botonConTexto={botonConTexto}
        onElegir={() => setEligiendo(true)}
        destacados={todas.length > 0 ? destacados : []}
        onAbrir={(doc) => visor.abrir(doc, destacados)}
        enGrande={enGrande}
        onCompartir={() => setCompartiendo(true)}
      />

      {q.trim().length >= 2 && todas.length > 0 && (
        <PapelesEncontrados
          q={q}
          resultados={resultados}
          onAbrir={visor.abrir}
          onIrACarpeta={(esencialId, carpetaId) => { setElegida(esencialId); setDentroDe(carpetaId); }}
          menuDe={(doc) => menuDe(doc)}
        />
      )}

      {todas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-12 text-center" data-qa="esenciales-vacio">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-muted)]">
            <Star className="h-6 w-6 text-[var(--accent-ink)] dark:text-[var(--accent)]" />
          </span>
          <p className="text-sm font-bold text-[var(--text-primary)]">Todavía no elegiste carpetas esenciales.</p>
          <AvisosEsenciales arch={arch} todas={todas} vivos={vivos} uso={uso} abrir={visor.abrir} soloSugerencias />
          <button type="button" onClick={() => onAbrirEnArchivo(null)} className={cn(button({ variant: "secondary" }), "gap-2")}>
            <FolderOpen className="h-4 w-4" /> Ir al Archivo
          </button>
        </div>
      ) : enGrande && elegida && mirando ? (
        <CarpetaAmplia
          e={elegida}
          arch={arch}
          uso={uso}
          ahora={ahora}
          dentroDe={mirando}
          setDentroDe={setDentroDe}
          orden={ordenPapeles}
          setOrden={setOrdenPapeles}
          abrir={visor.abrir}
          onVolver={() => setAmplia(false)}
          onAbrirEnArchivo={(id) => onAbrirEnArchivo(id)}
          onQuitar={quitar}
          accionesExtra={<LeerPapeles docs={vivos.filter((d) => !!d.folderId && elegida.carpetaIds.has(d.folderId))} arch={arch} />}
        />
      ) : (
        <>
        {!q && <AvisosEsenciales arch={arch} todas={todas} vivos={vivos} uso={uso} abrir={visor.abrir} />}
        <div className={cn("grid items-start gap-4", conPanel && !acoplado && elegida && "grid-cols-[minmax(0,1fr)_26rem]")}>
          {lista.length === 0 ? (
            resultados.length === 0 && (
              <p className="rounded-2xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">Ninguna carpeta con «{q.trim()}».</p>
            )
          ) : (
            <TarjetasEsenciales lista={lista} ordenActual={ordenActual} elegidaId={elegida?.carpeta.id ?? null} ahora={ahora} acciones={acciones} />
          )}
          {conPanel && !acoplado && panel && (
            <aside className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4" aria-label={`Lo que tiene ${elegida?.carpeta.name ?? ""}`}>
              {panel}
            </aside>
          )}
        </div>
        </>
      )}

      {acoplado && panel && lateral && createPortal(
        <aside
          // Pegada al borde, de arriba hasta abajo; con el aviso de la agenda abierto, él va arriba y esto abajo.
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-l border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
          aria-label={`Lo que tiene ${elegida?.carpeta.name ?? ""}`}
          data-qa="esencial-columna"
        >
          {panel}
        </aside>,
        lateral,
      )}

      {/* Sin medir todavía (primer cuadro) no se abre: el cajón parpadearía antes del panel al costado. */}
      {!conPanel && ancho > 0 && (lateral === undefined || anchoSeccion > 0) && panel && (
        <CajonLateral etiqueta={`Lo que tiene ${elegida?.carpeta.name ?? ""}`} onCerrar={() => setElegida(null)}>
          {panel}
        </CajonLateral>
      )}

      {compartiendo && <CompartirEsencialesModal carpetas={todas.map((e) => e.carpeta)} onClose={() => setCompartiendo(false)} />}
      {iconoDe && <IconoCarpetaModal folder={iconoDe} updateFolder={updateFolder} bulkFolders={bulkFolders} onClose={() => setIconoDe(null)} />}
      {escaneandoEn && <EscanerModal folderId={escaneandoEn.id} onClose={() => setEscaneandoEn(null)} onDone={() => void refresh()} />}
      {eligiendo && <ElegirCarpetasModal carpetas={folders} onGuardar={guardarElegidas} onClose={() => setEligiendo(false)} />}

      {/* La vista previa: sus flechas pasan por la carpeta abierta, no por todo el Archivo. */}
      <VistaPreviaArchivo arch={arch} lista={visor.lista} />
    </div>
  );
}
