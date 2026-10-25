"use client";

/**
 * El cerebro del explorador del Archivo (íconos grandes, medianos, lista y
 * detalles), como el Explorador de Windows: qué se ve en la carpeta abierta y
 * en qué orden y grupos, qué está elegido, Atrás / Adelante / Subir, el panel
 * lateral escondido, el teclado y los menús. `DocumentosModule` le pasa lo que
 * ya tiene (carpetas, documentos, endpoints) y dibuja lo que esto devuelve:
 * `propsVista` para la grilla y `barra` para la barra de dirección.
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import type { AccionesDocumento, EstadoDelMenu, ExtraDelMenu } from "../MenuDocumento";
import type { ObjetoPropiedades } from "./PropiedadesExplorador";
import type { PropsVistaExplorador } from "./VistaExplorador";
import { claveCarpeta, claveDoc, contenidoExplorador } from "./contenido-explorador";
import type { CargaArrastre } from "./destino-soltar";
import type { AccionesLote } from "./menu-elemento";
import type { DatosLugares } from "./menu-lugares";
import type { OrdenArchivo } from "./menus-explorador";
import { agrupar, enOrden, ordenarCarpetas, ordenarDocs } from "./orden-agrupar";
import { usePreferenciasExplorador } from "./preferencias-explorador";
import { useAccesoRapido } from "./use-acceso-rapido";
import { useAccionesExplorador, type DepsAcciones } from "./use-acciones-explorador";
import { useHistorialCarpetas } from "./use-historial-carpetas";
import { useMenusExplorador } from "./use-menus-explorador";
import { esClaveCarpeta, idDeClave, useSeleccionExplorador } from "./use-seleccion-explorador";
import { useTecladoExplorador } from "./use-teclado-explorador";
import { esVistaExplorador, esVistaIconos, type VistaArchivo } from "./vista-archivo";

export interface DepsExplorador {
  slug: string;
  vista: VistaArchivo;
  setVista: (v: VistaArchivo) => void;
  modo: string;
  /** La carpeta abierta (sólo en `modo === "folder"`). */
  carpetaId: string | null;
  /** De la raíz a la carpeta abierta. */
  ruta: readonly DbDocumentFolder[];
  /** `null` = la raíz del Archivo. */
  irACarpeta: (id: string | null) => void;
  /** Lo que se ve (filtrado y ordenado). */
  docs: DbDocument[];
  /** Todo lo cargado (para abrir lo fijado sin otro viaje). */
  documentos: DbDocument[];
  carpetas: DbDocumentFolder[];
  hijos: Map<string | null, DbDocumentFolder[]>;
  porId: Map<string, DbDocumentFolder>;
  busqueda: string;
  acotado: boolean;
  orden: OrdenArchivo;
  setOrden: (o: OrdenArchivo) => void;
  /** Los archivos elegidos del módulo (los mismos que ve la barra en lote). */
  seleccion: ReadonlySet<string>;
  setSeleccion: (s: Set<string>) => void;
  alternarSeleccion: (id: string) => void;
  prompt: ReturnType<typeof useConfirm>["prompt"];
  createFolder: DepsAcciones["createFolder"];
  updateFolder: (id: string, cambios: { name?: string; icon?: string | null }) => Promise<void>;
  renombrarDoc: DepsAcciones["renombrarDoc"];
  upload: DepsAcciones["upload"];
  bulk: DepsAcciones["bulk"];
  moveFolder: DepsAcciones["moveFolder"];
  deleteFolder: DepsAcciones["deleteFolder"];
  restoreMany: DepsAcciones["restoreMany"];
  refrescar: () => unknown;
  abrirSubida: () => void;
  personalizar: (f: DbDocumentFolder) => void;
  compartir: (f: DbDocumentFolder) => void;
  armarExpediente?: (f: DbDocumentFolder) => void;
  /** «Vínculos con el sistema…»: ligada a un tercero, la carpeta pasa a verse en la pestaña Terceros (ADR-502, por etiqueta). */
  vincularTercero?: (f: DbDocumentFolder) => void;
  /** «Llevar a Esenciales»: la carpeta pasa a verse en Documentos › Esenciales (etiqueta `marca:esencial`). */
  alternarEsencial?: (f: DbDocumentFolder) => void;
  /** «Copiar código» / «Marcar como registrado» (ADR-516). */
  extrasCodigo?: (doc: DbDocument) => ExtraDelMenu[];
  eliminarCarpetas: (fs: DbDocumentFolder[]) => void;
  zip: (docs: DbDocument[], nombre: string) => Promise<void>;
  verDoc: (d: DbDocument) => void;
  accionesDoc: (doc: DbDocument) => AccionesDocumento;
  estados: readonly EstadoDelMenu[];
  lote: AccionesLote;
  etiquetaEstado: (estado: string) => string;
  /** «Favoritos», «Recientes»… (Propiedades fuera de las carpetas). */
  nombreLugar: string;
  lugares: Omit<DatosLugares, "fijados" | "abrirFijado" | "hijos" | "abrirCarpeta" | "carpetaActiva" | "panel">;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// El panel lateral sólo existe desde 1024 px: más angosto no se ofrece esconderlo.
const ANCHO = "(min-width: 1024px)";
const suscribirAncho = (cb: () => void) => {
  const m = typeof window !== "undefined" ? window.matchMedia?.(ANCHO) : undefined;
  m?.addEventListener?.("change", cb);
  return () => m?.removeEventListener?.("change", cb);
};
const esAncho = () => !!window.matchMedia?.(ANCHO)?.matches;

export function useExplorador(d: DepsExplorador) {
  const acceso = useAccesoRapido(d.slug);
  const prefs = usePreferenciasExplorador();
  const ancho = useSyncExternalStore(suscribirAncho, esAncho, () => true);
  const historial = useHistorialCarpetas(d.modo === "folder" ? d.carpetaId : null);
  const explorando = esVistaExplorador(d.vista) && d.modo !== "trash";
  const vistaIconos = explorando && esVistaIconos(d.vista) ? d.vista : null;
  // Nunca elegido = el explorador va sin panel, como Windows con el panel cerrado.
  const sinPanel = explorando && !(prefs.panelLateral ?? false);
  const enCarpetas = d.modo === "all" || d.modo === "folder";
  const aqui = d.modo === "folder" ? d.carpetaId : null;

  const { modo, carpetaId, docs, carpetas, hijos, porId, busqueda, acotado } = d;
  const contenido = useMemo(
    () => contenidoExplorador({ modo, carpetaId, docs, carpetas, hijos, porId, busqueda, acotado }),
    [modo, carpetaId, docs, carpetas, hijos, porId, busqueda, acotado],
  );
  const { orden, etiquetaEstado } = d;
  const { invertido, agruparPor } = prefs;
  const grupos = useMemo(
    () => agrupar(ordenarCarpetas(contenido.carpetas, orden, invertido), ordenarDocs(contenido.docs, orden, invertido), agruparPor, { etiquetaEstado }),
    [contenido, orden, invertido, agruparPor, etiquetaEstado],
  );
  const nombres = useMemo(
    () => enOrden(grupos).map((x) => (x.tipo === "carpeta" ? { clave: claveCarpeta(x.carpeta.id), nombre: x.carpeta.name } : { clave: claveDoc(x.doc.id), nombre: x.doc.name })),
    [grupos],
  );
  const claves = useMemo(() => nombres.map((n) => n.clave), [nombres]);
  const docPorId = useMemo(() => new Map(d.documentos.map((x) => [x.id, x])), [d.documentos]);

  // Una carpeta borrada (aquí o desde otro equipo) sale del Acceso rápido.
  const { podarCarpetas } = acceso;
  useEffect(() => {
    if (carpetas.length > 0) podarCarpetas((id) => porId.has(id));
  }, [carpetas, porId, podarCarpetas]);

  const sel = useSeleccionExplorador({
    orden: claves,
    docsSel: d.seleccion,
    setDocsSel: d.setSeleccion,
    lugar: `${modo}:${carpetaId ?? ""}:${d.vista}`,
    activo: vistaIconos !== null,
  });

  const acc = useAccionesExplorador({
    porId, hijos, docPorId, documentos: d.documentos, prompt: d.prompt, bulk: d.bulk, moveFolder: d.moveFolder,
    updateFolder: d.updateFolder, renombrarDoc: d.renombrarDoc, createFolder: d.createFolder, deleteFolder: d.deleteFolder,
    restoreMany: d.restoreMany, upload: d.upload, refrescar: d.refrescar, eliminarCarpetas: d.eliminarCarpetas,
    marcar: (clave) => sel.clic(clave),
  });

  const atras = () => {
    const destino = historial.atras();
    if (destino !== undefined) d.irACarpeta(destino);
  };
  const adelante = () => {
    const destino = historial.adelante();
    if (destino !== undefined) d.irACarpeta(destino);
  };
  const subir = () => {
    if (d.ruta.length === 0) return;
    d.irACarpeta(d.ruta.length > 1 ? d.ruta[d.ruta.length - 2].id : null);
  };

  const alternarPanel = () => prefs.fijarPanel(!(prefs.panelLateral ?? false));
  /** Pasar de Tarjetas a una vista del explorador esconde el panel (después lo prendes si lo quieres). */
  const elegirVista = (v: VistaArchivo) => {
    if (esVistaExplorador(v) && !esVistaExplorador(d.vista) && prefs.panelLateral) prefs.fijarPanel(false);
    d.setVista(v);
  };

  const abrirClave = (clave: string) => {
    const id = idDeClave(clave);
    if (esClaveCarpeta(clave)) { d.irACarpeta(id); return; }
    const doc = docPorId.get(id);
    if (doc) d.verDoc(doc);
  };

  const lugarActual = (): ObjetoPropiedades => {
    if (modo === "folder" && carpetaId) return { tipo: "lugar", nombre: porId.get(carpetaId)?.name ?? "Carpeta", carpetaId };
    if (modo === "all" && !acotado) return { tipo: "lugar", nombre: "Archivo", carpetaId: null };
    return { tipo: "lugar", nombre: d.nombreLugar, carpetaId: null, docs: contenido.docs };
  };

  const menus = useMenusExplorador({
    acceso, acc, sel, porId, hijos, totalCarpetas: carpetas.length, docPorId,
    irACarpeta: d.irACarpeta, verDoc: d.verDoc, updateFolder: d.updateFolder, upload: d.upload, zip: d.zip,
    personalizar: d.personalizar, compartir: d.compartir, armarExpediente: d.armarExpediente, vincularTercero: d.vincularTercero, alternarEsencial: d.alternarEsencial, extrasCodigo: d.extrasCodigo, accionesDoc: d.accionesDoc, estados: d.estados, lote: d.lote,
    etiquetaEstado, seleccionDocs: d.seleccion, alternarSeleccion: d.alternarSeleccion,
    fondo: () => ({
      vista: d.vista,
      cambiarVista: elegirVista,
      panelVisible: explorando && ancho ? !sinPanel : null,
      alternarPanel,
      orden,
      cambiarOrden: d.setOrden,
      invertido,
      fijarInvertido: prefs.fijarInvertido,
      agruparPor,
      cambiarAgrupar: prefs.fijarAgrupar,
      hayBusqueda: busqueda.trim().length > 0,
      enCarpetas,
      etiquetaDeshacer: acc.etiquetaDeshacer,
      deshacer: acc.deshacer,
      hayCortado: acc.hayCortado,
      pegar: () => void acc.pegar(aqui),
      hayElementos: claves.length > 0,
      seleccionarTodo: sel.todo,
      nuevaCarpeta: () => void acc.nuevaCarpeta(aqui),
      nuevoTexto: () => void acc.nuevoTexto(aqui),
      nuevaHoja: () => void acc.nuevaHoja(aqui),
      subir: d.abrirSubida,
      actualizar: () => void d.refrescar(),
    }),
    lugarActual,
    lugares: { ...d.lugares, carpetaActiva: aqui, panel: ancho && explorando ? { visible: !sinPanel, alternar: alternarPanel } : undefined },
  });

  // F2 y Alt+Entrar actúan sobre el que tiene el foco si está entre los elegidos.
  const principal = () => (sel.marcado && sel.efectiva.includes(sel.marcado) ? sel.marcado : sel.efectiva[0]);
  const onKeyDown = useTecladoExplorador({
    nombres,
    marcado: sel.marcado,
    hayAlgoQueSoltar: sel.hayAlgo || acc.hayCortado,
    clic: sel.clic,
    abrir: abrirClave,
    menu: menus.menu,
    renombrar: () => { const c = principal(); if (c) void acc.renombrar(c); },
    eliminar: () => { if (sel.efectiva.length > 0) void acc.eliminar(sel.efectiva); },
    todo: sel.todo,
    cortar: () => acc.cortar(sel.efectiva),
    pegar: () => { if (enCarpetas) void acc.pegar(aqui); },
    deshacer: acc.deshacer,
    propiedades: () => menus.propiedadesDe(sel.efectiva.length > 0 ? sel.efectiva : null),
    soltar: () => { sel.limpiar(); acc.soltarPortapapeles(); },
    atras,
    adelante,
    subir,
  });

  const resumen = [
    contenido.carpetas.length > 0 && plural(contenido.carpetas.length, "carpeta", "carpetas"),
    contenido.docs.length > 0 && plural(contenido.docs.length, "archivo", "archivos"),
  ].filter(Boolean).join(" · ") || "Vacía";

  const propsVista: PropsVistaExplorador | null = vistaIconos
    ? {
        vista: vistaIconos,
        grupos,
        sel,
        onKeyDown,
        estaCortado: acc.estaCortado,
        abrir: abrirClave,
        menu: menus.menu,
        // Arrastrar algo elegido lleva todo lo elegido; si no, sólo eso.
        cargaAlArrastrar: (clave) => acc.cargaDe(sel.esta(clave) ? sel.efectiva : [clave]),
        puedeSoltar: (id) => acc.puedeSoltar(id),
        soltar: (carga, id) => void acc.mover(carga, id),
        vacio: acotado
          ? "Nada coincide con lo que buscas."
          : enCarpetas ? "Esta carpeta está vacía: arrastra archivos aquí o haz clic derecho › Nuevo." : "No hay nada aquí.",
        resumen,
      }
    : null;

  const barra = {
    puedeAtras: historial.puedeAtras,
    onAtras: atras,
    puedeAdelante: historial.puedeAdelante,
    onAdelante: adelante,
    puedeSoltar: (id: string | null) => acc.puedeSoltar(id),
    onSoltar: (carga: CargaArrastre, id: string | null) => void acc.mover(carga, id),
    lugares: menus.lugares,
    panel: explorando ? { visible: !sinPanel, alternar: alternarPanel } : undefined,
  };

  return {
    explorando,
    sinPanel,
    enCarpetas,
    panelLateral: !sinPanel,
    alternarPanel,
    elegirVista,
    contenido,
    resumen,
    propsVista,
    barra,
    puedeAtras: historial.puedeAtras,
    atras,
    subir,
    abrirMenu: menus.abrirMenu,
    abrirMenuFijado: menus.abrirMenuFijado,
    abrirFijado: menus.abrirFijado,
    renombrar: (clave: string) => void acc.renombrar(clave),
    acceso,
    docPorId,
    extrasDe: menus.extrasDe,
    capas: menus.capas,
  };
}
