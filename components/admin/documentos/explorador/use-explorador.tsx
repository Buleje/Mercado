"use client";

/**
 * El cerebro del explorador del Archivo (íconos grandes, medianos, lista y
 * detalles): qué se ve en la carpeta abierta, Atrás / Subir, el clic derecho
 * de carpetas, fondo y Acceso rápido, renombrar, la imagen de ícono y lo
 * fijado. `DocumentosModule` le pasa lo que ya tiene (carpetas, documentos,
 * cómo abrir una carpeta) y dibuja lo que esto devuelve.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { getDocumentDetail } from "@/hooks/use-documents";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import type { PuntoDeMenu } from "../MenuDocumento";
import { PREFIJO_ICONO_DOC } from "../folder-visuals";
import ElegirImagenCarpeta from "./ElegirImagenCarpeta";
import MenuEnPunto, { type ItemMenu } from "./MenuEnPunto";
import { useHistorialCarpetas } from "./MigasRuta";
import type { ObjetivoMenu } from "./VistaExplorador";
import { contenidoExplorador } from "./contenido-explorador";
import { extrasDelDoc, itemsDeCarpeta, itemsDelFijado, itemsDelFondo, type AccionesCarpeta, type OrdenArchivo } from "./menus-explorador";
import { useAccesoRapido, type Fijado } from "./use-acceso-rapido";
import { esVistaExplorador, type VistaArchivo } from "./vista-archivo";

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
  seleccion: ReadonlySet<string>;
  alternarSeleccion: (id: string) => void;
  prompt: ReturnType<typeof useConfirm>["prompt"];
  createFolder: (i: { name: string; parentId: string | null }) => Promise<DbDocumentFolder>;
  updateFolder: (id: string, cambios: { name?: string; icon?: string | null }) => Promise<void>;
  renombrarDoc: (id: string, nombre: string) => Promise<unknown>;
  upload: (files: File[], opts: { folderId: string | null }) => Promise<DbDocument[]>;
  refresh: () => unknown;
  abrirSubida: () => void;
  personalizar: (f: DbDocumentFolder) => void;
  compartir: (f: DbDocumentFolder) => void;
  eliminar: (f: DbDocumentFolder) => void;
  zip: (docs: DbDocument[], nombre: string) => Promise<void>;
  verDoc: (d: DbDocument) => void;
  /** El menú de un archivo es el `MenuDocumento` de siempre: se abre en un punto. */
  menuDoc: (id: string, punto: PuntoDeMenu) => void;
}

type Abierto = { obj: ObjetivoMenu | { tipo: "fijado"; fijado: Fijado }; punto: PuntoDeMenu };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const errorDe = (err: unknown) => (err instanceof Error ? err.message.slice(0, 120) : "error");

export function useExplorador(d: DepsExplorador) {
  const acceso = useAccesoRapido(d.slug);
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const [imagenPara, setImagenPara] = useState<DbDocumentFolder | null>(null);
  const historial = useHistorialCarpetas(d.modo === "folder" ? d.carpetaId : null);
  const explorando = esVistaExplorador(d.vista) && d.modo !== "trash";

  const { modo, carpetaId, docs, carpetas, hijos, porId, busqueda, acotado } = d;
  const contenido = useMemo(
    () => contenidoExplorador({ modo, carpetaId, docs, carpetas, hijos, porId, busqueda, acotado }),
    [modo, carpetaId, docs, carpetas, hijos, porId, busqueda, acotado],
  );

  const docPorId = useMemo(() => new Map(d.documentos.map((x) => [x.id, x])), [d.documentos]);

  // Una carpeta borrada (aquí o desde otro equipo) sale del Acceso rápido.
  const { podarCarpetas } = acceso;
  useEffect(() => {
    if (carpetas.length > 0) podarCarpetas((id) => porId.has(id));
  }, [carpetas, porId, podarCarpetas]);

  const atras = () => {
    const destino = historial.atras();
    if (destino !== undefined) d.irACarpeta(destino);
  };
  const subir = () => {
    if (d.ruta.length === 0) return;
    d.irACarpeta(d.ruta.length > 1 ? d.ruta[d.ruta.length - 2].id : null);
  };

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

  const nuevaCarpeta = async (padreId: string | null) => {
    const nombre = await d.prompt({ title: "Nueva carpeta", label: "Nombre", placeholder: "Ej.: Facturas 2026", required: true, confirmLabel: "Crear" });
    if (!nombre?.trim()) return;
    try {
      await d.createFolder({ name: nombre.trim(), parentId: padreId });
    } catch (err) {
      toast.error(`No se pudo crear la carpeta: ${errorDe(err)}`);
    }
  };

  const renombrar = async (obj: Exclude<ObjetivoMenu, { tipo: "fondo" }>) => {
    const actual = obj.tipo === "carpeta" ? obj.carpeta.name : obj.doc.name;
    const nombre = await d.prompt({ title: "Cambiar nombre", label: "Nombre", defaultValue: actual, required: true, confirmLabel: "Guardar" });
    const limpio = nombre?.trim();
    if (!limpio || limpio === actual) return;
    try {
      if (obj.tipo === "carpeta") await d.updateFolder(obj.carpeta.id, { name: limpio });
      else await d.renombrarDoc(obj.doc.id, limpio);
    } catch (err) {
      toast.error(`No se pudo cambiar el nombre: ${errorDe(err)}`);
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

  const accionesCarpeta: AccionesCarpeta = {
    abrir: (f) => d.irACarpeta(f.id),
    estaFijado: acceso.estaFijado,
    alternarFijado,
    nuevaCarpeta: (padre) => void nuevaCarpeta(padre),
    renombrar: (f) => void renombrar({ tipo: "carpeta", carpeta: f }),
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
    eliminar: d.eliminar,
  };

  const abrirMenu = (obj: ObjetivoMenu, punto: PuntoDeMenu) => {
    if (obj.tipo === "doc") d.menuDoc(obj.doc.id, punto);
    else setAbierto({ obj, punto });
  };
  const abrirMenuFijado = (fijado: Fijado, punto: PuntoDeMenu) => setAbierto({ obj: { tipo: "fijado", fijado }, punto });

  let items: ItemMenu[] = [];
  let etiqueta = "Opciones";
  const o = abierto?.obj;
  if (o?.tipo === "carpeta") {
    items = itemsDeCarpeta(o.carpeta, accionesCarpeta);
    etiqueta = `Opciones de la carpeta ${o.carpeta.name}`;
  } else if (o?.tipo === "fondo") {
    items = itemsDelFondo({
      vista: d.vista,
      cambiarVista: d.setVista,
      orden: d.orden,
      cambiarOrden: d.setOrden,
      hayBusqueda: busqueda.trim().length > 0,
      enCarpetas: modo === "all" || modo === "folder",
      nuevaCarpeta: () => void nuevaCarpeta(modo === "folder" ? carpetaId : null),
      subir: d.abrirSubida,
      actualizar: () => void d.refresh(),
    });
    etiqueta = "Opciones de la vista";
  } else if (o?.tipo === "fijado") {
    const i = acceso.fijados.findIndex((x) => x.id === o.fijado.id);
    items = itemsDelFijado(o.fijado, { i, total: acceso.fijados.length }, { abrir: (f) => void abrirFijado(f), mover: acceso.mover, quitar: acceso.quitar });
    etiqueta = `Opciones de ${o.fijado.nombre}`;
  }

  const extrasDe = (doc: DbDocument) =>
    extrasDelDoc(doc, {
      fijado: acceso.estaFijado(doc.id),
      alternarFijado,
      seleccionado: d.seleccion.has(doc.id),
      alternarSeleccion: d.alternarSeleccion,
      usarComoIcono: (x) => { if (x.folderId) void ponerImagen(x.folderId, x.id); },
    });

  const capas = (
    <>
      <MenuEnPunto abrirEn={abierto?.punto ?? null} items={items} etiqueta={etiqueta} onCerrado={() => setAbierto(null)} />
      {imagenPara && (
        <ElegirImagenCarpeta
          carpeta={imagenPara}
          onElegir={(docId) => ponerImagen(imagenPara.id, docId)}
          onQuitar={() => d.updateFolder(imagenPara.id, { icon: null })}
          onSubir={async (file) => (await d.upload([file], { folderId: imagenPara.id }))[0]}
          onClose={() => setImagenPara(null)}
        />
      )}
    </>
  );

  const resumen = `${plural(contenido.carpetas.length, "carpeta", "carpetas")} · ${plural(contenido.docs.length, "archivo", "archivos")}`;

  return {
    explorando,
    contenido,
    resumen,
    puedeAtras: historial.puedeAtras,
    atras,
    subir,
    abrirMenu,
    abrirMenuFijado,
    abrirFijado: (f: Fijado) => void abrirFijado(f),
    renombrar: (obj: Exclude<ObjetivoMenu, { tipo: "fondo" }>) => void renombrar(obj),
    acceso,
    docPorId,
    extrasDe,
    capas,
  };
}
