"use client";

/**
 * Los menús y ventanas del explorador del Archivo: el clic derecho de cada
 * cosa (fondo, carpeta, archivo, varios elegidos, lo fijado), «Lugares» de la
 * barra, Propiedades y la imagen de ícono de una carpeta. Qué hace cada opción
 * lo pone `use-acciones-explorador` (con su Ctrl+Z); esto decide qué se ofrece
 * y dónde se abre.
 *
 * Las opciones se arman al abrir el menú y no cambian mientras está abierto.
 */

import { useState } from "react";
import { toast } from "sonner";
import { getDocumentDetail } from "@/hooks/use-documents";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import type { AccionesDocumento, EstadoDelMenu } from "../MenuDocumento";
import { PREFIJO_ICONO_DOC } from "../folder-visuals";
import ElegirImagenCarpeta from "./ElegirImagenCarpeta";
import MenuEnPunto from "./MenuEnPunto";
import PropiedadesExplorador, { type ObjetoPropiedades } from "./PropiedadesExplorador";
import type { ObjetivoMenu } from "./VistaExplorador";
import { claveCarpeta, claveDoc } from "./contenido-explorador";
import type { ItemMenu } from "./item-menu";
import { itemsDelFondoExplorador, type AccionesDelFondo } from "./menu-fondo";
import { itemsDelDoc, itemsDeVarios, type AccionesLote } from "./menu-elemento";
import { itemsDeLugares, type DatosLugares } from "./menu-lugares";
import { extrasDelDoc, itemsDeCarpeta, itemsDelFijado, type AccionesCarpeta } from "./menus-explorador";
import type { PuntoDeMenu } from "./ubicar-menu";
import type { Fijado, useAccesoRapido } from "./use-acceso-rapido";
import type { AccionesExplorador } from "./use-acciones-explorador";
import { esClaveCarpeta, idDeClave, type SeleccionExplorador } from "./use-seleccion-explorador";

export interface DepsMenus {
  acceso: ReturnType<typeof useAccesoRapido>;
  acc: AccionesExplorador;
  sel: SeleccionExplorador;
  porId: Map<string, DbDocumentFolder>;
  hijos: Map<string | null, DbDocumentFolder[]>;
  totalCarpetas: number;
  docPorId: Map<string, DbDocument>;
  irACarpeta: (id: string | null) => void;
  verDoc: (d: DbDocument) => void;
  updateFolder: (id: string, cambios: { name?: string; icon?: string | null }) => Promise<void>;
  upload: (files: File[], opts: { folderId: string | null }) => Promise<DbDocument[]>;
  zip: (docs: DbDocument[], nombre: string) => Promise<void>;
  personalizar: (f: DbDocumentFolder) => void;
  compartir: (f: DbDocumentFolder) => void;
  /** Lo de siempre de un archivo (ver, descargar, firmar, sellar…). */
  accionesDoc: (doc: DbDocument) => AccionesDocumento;
  estados: readonly EstadoDelMenu[];
  /** Con varios archivos elegidos (actúa sobre la selección del módulo). */
  lote: AccionesLote;
  etiquetaEstado: (estado: string) => string;
  seleccionDocs: ReadonlySet<string>;
  alternarSeleccion: (id: string) => void;
  /** El menú del espacio vacío; «Propiedades» lo pone este hook. */
  fondo: () => Omit<AccionesDelFondo, "propiedades">;
  /** Donde estás parado (Propiedades del fondo). */
  lugarActual: () => ObjetoPropiedades;
  lugares: Omit<DatosLugares, "fijados" | "abrirFijado" | "hijos" | "abrirCarpeta">;
}

type Abierto = { items: ItemMenu[]; etiqueta: string; punto: PuntoDeMenu };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const errorDe = (err: unknown) => (err instanceof Error ? err.message.slice(0, 120) : "error");

export function useMenusExplorador(d: DepsMenus) {
  const { acceso, acc, sel, porId, docPorId } = d;
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const [imagenPara, setImagenPara] = useState<DbDocumentFolder | null>(null);
  const [propiedades, setPropiedades] = useState<ObjetoPropiedades | null>(null);

  const abrir = (items: ItemMenu[], etiqueta: string, punto: PuntoDeMenu) => setAbierto({ items, etiqueta, punto });

  const alternarFijado = (f: Fijado) => {
    const ya = acceso.estaFijado(f.id);
    acceso.alternar(f);
    toast.success(ya ? `Quitaste «${f.nombre}» de Acceso rápido.` : `Fijaste «${f.nombre}» en Acceso rápido.`);
  };

  const ponerImagen = async (folderId: string, docId: string) => {
    try {
      await d.updateFolder(folderId, { icon: `${PREFIJO_ICONO_DOC}${docId}` });
      toast.success("Listo: la carpeta ya tiene su imagen.");
    } catch (err) {
      toast.error(`No se pudo poner la imagen: ${errorDe(err)}`);
    }
  };

  const descargarCarpeta = async (f: DbDocumentFolder) => {
    const aviso = toast.loading(`Comprimiendo «${f.name}»…`);
    try {
      const res = await fetch(`/api/admin/documents?folderId=${encodeURIComponent(f.id)}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const lista = ((await res.json()) as { documents?: DbDocument[] }).documents ?? [];
      if (lista.length === 0) {
        toast.info("Esa carpeta no tiene archivos sueltos para bajar.", { id: aviso });
        return;
      }
      await d.zip(lista, `${f.name.replace(/[^\w.-]+/g, "_") || "carpeta"}.zip`);
      toast.success(`Listo: ${plural(lista.length, "archivo", "archivos")} en el ZIP.`, { id: aviso });
    } catch (err) {
      toast.error(`No se pudo descargar: ${errorDe(err)}`, { id: aviso });
    }
  };

  const copiarEnlace = async (f: DbDocumentFolder) => {
    const url = `${window.location.origin}/admin?tab=documentos&vista=drive&sub=folder&carpeta=${encodeURIComponent(f.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado: quien lo abra (con permiso) entra directo a la carpeta.");
    } catch {
      toast.error("El navegador no dejó copiar el enlace.");
    }
  };

  const abrirFijado = async (f: Fijado) => {
    if (f.tipo === "carpeta") {
      if (porId.has(f.id)) d.irACarpeta(f.id);
      else { acceso.quitar(f.id); toast.info(`«${f.nombre}» ya no existe: la quité de Acceso rápido.`); }
      return;
    }
    const cargado = docPorId.get(f.id);
    if (cargado) { d.verDoc(cargado); return; }
    try {
      const { document } = await getDocumentDetail(f.id);
      d.verDoc(document);
    } catch {
      acceso.quitar(f.id);
      toast.info(`«${f.nombre}» ya no está en el Archivo: lo quité de Acceso rápido.`);
    }
  };

  /** «Archivo › Facturas › 2026» (`null` = la raíz). */
  const rutaDe = (carpetaId: string | null) => {
    const tramos: string[] = [];
    const visto = new Set<string>();
    let c = carpetaId ? porId.get(carpetaId) : undefined;
    while (c && !visto.has(c.id)) {
      visto.add(c.id);
      tramos.unshift(c.name);
      c = c.parentId ? porId.get(c.parentId) : undefined;
    }
    return ["Archivo", ...tramos].join(" › ");
  };

  /** Propiedades de lo elegido; `null` o nada = del lugar donde estás. */
  const propiedadesDe = (claves: readonly string[] | null) => {
    const carpetas = (claves ?? []).filter(esClaveCarpeta).map((c) => porId.get(idDeClave(c))).filter((f): f is DbDocumentFolder => !!f);
    const docs = (claves ?? []).filter((c) => !esClaveCarpeta(c)).map((c) => docPorId.get(idDeClave(c))).filter((x): x is DbDocument => !!x);
    if (carpetas.length + docs.length === 0) setPropiedades(d.lugarActual());
    else if (carpetas.length + docs.length > 1) setPropiedades({ tipo: "varios", docs, carpetas });
    else setPropiedades(carpetas[0] ? { tipo: "carpeta", carpeta: carpetas[0] } : { tipo: "doc", doc: docs[0] });
  };

  const accionesCarpeta: AccionesCarpeta = {
    abrir: (f) => d.irACarpeta(f.id),
    estaFijado: acceso.estaFijado,
    alternarFijado,
    nuevaCarpeta: (padre) => void acc.nuevaCarpeta(padre),
    renombrar: (f) => void acc.renombrar(claveCarpeta(f.id)),
    personalizar: d.personalizar,
    elegirImagen: setImagenPara,
    quitarImagen: (f) => {
      d.updateFolder(f.id, { icon: null })
        .then(() => toast.success("Listo: la carpeta volvió a su ícono."))
        .catch((err) => toast.error(`No se pudo quitar la imagen: ${errorDe(err)}`));
    },
    compartir: d.compartir,
    copiarEnlace: (f) => void copiarEnlace(f),
    descargar: (f) => void descargarCarpeta(f),
    eliminar: (f) => void acc.eliminar([claveCarpeta(f.id)]),
    cortar: (f) => acc.cortar([claveCarpeta(f.id)]),
    hayCortado: acc.hayCortado,
    pegarEn: (f) => void acc.pegar(f.id),
    propiedades: (f) => setPropiedades({ tipo: "carpeta", carpeta: f }),
  };

  const extrasDe = (doc: DbDocument) =>
    extrasDelDoc(doc, {
      fijado: acceso.estaFijado(doc.id),
      alternarFijado,
      seleccionado: d.seleccionDocs.has(doc.id),
      alternarSeleccion: d.alternarSeleccion,
      usarComoIcono: (x) => { if (x.folderId) void ponerImagen(x.folderId, x.id); },
    });

  const itemsDoc = (doc: DbDocument) =>
    itemsDelDoc(d.accionesDoc(doc), {
      cortar: () => acc.cortar([claveDoc(doc.id)]),
      renombrar: () => void acc.renombrar(claveDoc(doc.id)),
      eliminar: () => void acc.eliminar([claveDoc(doc.id)]),
      propiedades: () => setPropiedades({ tipo: "doc", doc }),
      estados: d.estados,
      extras: extrasDe(doc),
    });

  const itemsFondo = () => itemsDelFondoExplorador({ ...d.fondo(), propiedades: () => propiedadesDe(null) });

  /** El menú del explorador de íconos: `null` = el espacio vacío. */
  const menu = (clave: string | null, punto: PuntoDeMenu, tactil = false) => {
    if (clave === null) { abrir(itemsFondo(), "Opciones de la vista", punto); return; }
    if (sel.esta(clave) && sel.efectiva.length > 1) {
      const claves = sel.efectiva;
      const carga = acc.cargaDe(claves);
      const items = itemsDeVarios(
        { docs: carga.docs.length, carpetas: carga.carpetas.length },
        {
          cortar: () => acc.cortar(claves),
          renombrar: () => undefined,
          eliminar: () => void acc.eliminar(claves),
          propiedades: () => propiedadesDe(claves),
          lote: d.lote,
          estados: d.estados,
        },
      );
      abrir(items, `Opciones de ${claves.length} elementos`, punto);
      return;
    }
    // En el celular se eligen varios con «Seleccionar»: mantener presionado
    // otro no borra lo elegido (con el mouse, sí: el clic derecho lo elige solo).
    if (!(tactil && sel.base.size > 0)) sel.alMenu(clave);
    const id = idDeClave(clave);
    if (esClaveCarpeta(clave)) {
      const f = porId.get(id);
      if (f) abrir(itemsDeCarpeta(f, accionesCarpeta), `Opciones de la carpeta ${f.name}`, punto);
      return;
    }
    const doc = docPorId.get(id);
    if (doc) abrir(itemsDoc(doc), `Opciones de ${doc.name}`, punto);
  };

  /** Desde el panel lateral o la vista Detalles. */
  const abrirMenu = (obj: ObjetivoMenu, punto: PuntoDeMenu) => {
    if (obj.tipo === "carpeta") abrir(itemsDeCarpeta(obj.carpeta, accionesCarpeta), `Opciones de la carpeta ${obj.carpeta.name}`, punto);
    else if (obj.tipo === "doc") abrir(itemsDoc(obj.doc), `Opciones de ${obj.doc.name}`, punto);
    else abrir(itemsFondo(), "Opciones de la vista", punto);
  };

  const abrirMenuFijado = (fijado: Fijado, punto: PuntoDeMenu) => {
    const i = acceso.fijados.findIndex((x) => x.id === fijado.id);
    const items = itemsDelFijado(fijado, { i, total: acceso.fijados.length }, { abrir: (f) => void abrirFijado(f), mover: acceso.mover, quitar: acceso.quitar });
    abrir(items, `Opciones de ${fijado.nombre}`, punto);
  };

  const lugares = () =>
    itemsDeLugares({
      ...d.lugares,
      fijados: acceso.fijados.map((f) => ({ id: f.id, nombre: f.nombre, esCarpeta: f.tipo === "carpeta" })),
      abrirFijado: (id) => {
        const f = acceso.fijados.find((x) => x.id === id);
        if (f) void abrirFijado(f);
      },
      hijos: d.hijos,
      abrirCarpeta: (id) => d.irACarpeta(id),
    });

  const capas = (
    <>
      <MenuEnPunto abrirEn={abierto?.punto ?? null} items={abierto?.items ?? []} etiqueta={abierto?.etiqueta ?? "Opciones"} onCerrado={() => setAbierto(null)} />
      {imagenPara && (
        <ElegirImagenCarpeta
          carpeta={imagenPara}
          onElegir={(docId) => ponerImagen(imagenPara.id, docId)}
          onQuitar={() => d.updateFolder(imagenPara.id, { icon: null })}
          onSubir={async (file) => (await d.upload([file], { folderId: imagenPara.id }))[0]}
          onClose={() => setImagenPara(null)}
        />
      )}
      <PropiedadesExplorador
        objeto={propiedades}
        onClose={() => setPropiedades(null)}
        rutaDe={rutaDe}
        hijos={d.hijos}
        todasLasCarpetas={d.totalCarpetas}
        etiquetaEstado={d.etiquetaEstado}
      />
    </>
  );

  return { menu, abrirMenu, abrirMenuFijado, abrirFijado: (f: Fijado) => void abrirFijado(f), extrasDe, propiedadesDe, lugares, capas };
}
