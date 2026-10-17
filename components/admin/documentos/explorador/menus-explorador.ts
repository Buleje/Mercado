/**
 * Qué ofrece el clic derecho del explorador del Archivo según dónde se hizo,
 * como en Windows: una carpeta, el fondo vacío, algo fijado en el Acceso
 * rápido, o un archivo (éste suma sus opciones al menú de siempre,
 * `MenuDocumento`). Sólo lo que funciona contra lo que ya existe.
 */

import {
  ArrowDown, ArrowUp, CheckSquare, Eye, FileArchive, FolderOpen, FolderPlus, ImageOff, ImagePlus,
  Link2, Palette, Pencil, Pin, PinOff, RefreshCw, Share2, Trash2, Upload,
} from "@buleje/design-system/icons";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { esImagenConvertible, esImagenRenderizable } from "@/lib/documents/tipos-archivo";
import type { ExtraDelMenu } from "../MenuDocumento";
import { docDeIconoCarpeta } from "../folder-visuals";
import type { ItemMenu } from "./MenuEnPunto";
import type { Fijado } from "./use-acceso-rapido";
import { VISTAS_ARCHIVO, type VistaArchivo } from "./vista-archivo";

export type OrdenArchivo = "recent" | "name" | "size" | "expiry" | "relevancia";

const ORDENES: readonly { id: OrdenArchivo; label: string }[] = [
  { id: "relevancia", label: "Más parecidos" },
  { id: "recent", label: "Más recientes" },
  { id: "name", label: "Nombre A–Z" },
  { id: "size", label: "Tamaño" },
  { id: "expiry", label: "Vence primero" },
];

export interface AccionesCarpeta {
  abrir: (f: DbDocumentFolder) => void;
  estaFijado: (id: string) => boolean;
  alternarFijado: (f: Fijado) => void;
  nuevaCarpeta: (padreId: string | null) => void;
  renombrar: (f: DbDocumentFolder) => void;
  personalizar: (f: DbDocumentFolder) => void;
  elegirImagen: (f: DbDocumentFolder) => void;
  quitarImagen: (f: DbDocumentFolder) => void;
  compartir: (f: DbDocumentFolder) => void;
  copiarEnlace: (f: DbDocumentFolder) => void;
  descargar: (f: DbDocumentFolder) => void;
  eliminar: (f: DbDocumentFolder) => void;
}

const SEP = (id: string): ItemMenu => ({ tipo: "separador", id });

export function itemsDeCarpeta(f: DbDocumentFolder, a: AccionesCarpeta): ItemMenu[] {
  const fijada = a.estaFijado(f.id);
  const conImagen = !!docDeIconoCarpeta(f.icon);
  const items: ItemMenu[] = [
    { id: "abrir", label: "Abrir", Icon: FolderOpen, principal: true, onSelect: () => a.abrir(f) },
    {
      id: "fijar",
      label: fijada ? "Quitar de Acceso rápido" : "Fijar en Acceso rápido",
      Icon: fijada ? PinOff : Pin,
      onSelect: () => a.alternarFijado({ tipo: "carpeta", id: f.id, nombre: f.name }),
    },
    SEP("s1"),
    { id: "nueva", label: "Nueva subcarpeta", Icon: FolderPlus, onSelect: () => a.nuevaCarpeta(f.id) },
    { id: "renombrar", label: "Cambiar nombre", Icon: Pencil, atajo: "F2", onSelect: () => a.renombrar(f) },
    { id: "personalizar", label: "Color e ícono", Icon: Palette, onSelect: () => a.personalizar(f) },
    {
      id: "imagen",
      label: conImagen ? "Cambiar la imagen del ícono" : "Poner una imagen de ícono",
      Icon: ImagePlus,
      onSelect: () => a.elegirImagen(f),
    },
  ];
  if (conImagen) items.push({ id: "quitar-imagen", label: "Quitar la imagen", Icon: ImageOff, onSelect: () => a.quitarImagen(f) });
  items.push(
    SEP("s2"),
    { id: "compartir", label: "Compartir", Icon: Share2, onSelect: () => a.compartir(f) },
    { id: "enlace", label: "Copiar enlace", Icon: Link2, onSelect: () => a.copiarEnlace(f) },
    {
      id: "zip",
      label: "Descargar (ZIP)",
      Icon: FileArchive,
      deshabilitado: (f.documentCount ?? 0) === 0,
      onSelect: () => a.descargar(f),
    },
    SEP("s3"),
    { id: "eliminar", label: "Eliminar", Icon: Trash2, peligro: true, onSelect: () => a.eliminar(f) },
  );
  return items;
}

export interface AccionesFondo {
  vista: VistaArchivo;
  cambiarVista: (v: VistaArchivo) => void;
  orden: OrdenArchivo;
  cambiarOrden: (o: OrdenArchivo) => void;
  /** «Más parecidos» sólo tiene sentido buscando. */
  hayBusqueda: boolean;
  /** Sin esto (Favoritos, Recientes…) no se ofrece crear ni subir. */
  enCarpetas: boolean;
  nuevaCarpeta: () => void;
  subir: () => void;
  actualizar: () => void;
}

export function itemsDelFondo(a: AccionesFondo): ItemMenu[] {
  return [
    { tipo: "titulo", id: "t-ver", label: "Ver" },
    ...VISTAS_ARCHIVO.map<ItemMenu>((v) => ({
      id: `ver-${v.id}`,
      label: v.label,
      Icon: v.Icon,
      marcado: a.vista === v.id,
      onSelect: () => a.cambiarVista(v.id),
    })),
    SEP("s1"),
    { tipo: "titulo", id: "t-orden", label: "Ordenar por" },
    ...ORDENES.filter((o) => o.id !== "relevancia" || a.hayBusqueda).map<ItemMenu>((o) => ({
      id: `orden-${o.id}`,
      label: o.label,
      marcado: a.orden === o.id,
      onSelect: () => a.cambiarOrden(o.id),
    })),
    SEP("s2"),
    ...(a.enCarpetas
      ? [
          { id: "nueva", label: "Nueva carpeta", Icon: FolderPlus, onSelect: a.nuevaCarpeta },
          { id: "subir", label: "Subir archivos", Icon: Upload, onSelect: a.subir },
        ]
      : []),
    { id: "actualizar", label: "Actualizar", Icon: RefreshCw, onSelect: a.actualizar },
  ];
}

export function itemsDelFijado(
  f: Fijado,
  lugar: { i: number; total: number },
  a: { abrir: (f: Fijado) => void; mover: (id: string, delta: -1 | 1) => void; quitar: (id: string) => void },
): ItemMenu[] {
  return [
    { id: "abrir", label: "Abrir", Icon: f.tipo === "carpeta" ? FolderOpen : Eye, principal: true, onSelect: () => a.abrir(f) },
    SEP("s1"),
    { id: "subir", label: "Subir en la lista", Icon: ArrowUp, deshabilitado: lugar.i === 0, onSelect: () => a.mover(f.id, -1) },
    { id: "bajar", label: "Bajar en la lista", Icon: ArrowDown, deshabilitado: lugar.i >= lugar.total - 1, onSelect: () => a.mover(f.id, 1) },
    SEP("s2"),
    { id: "quitar", label: "Quitar de Acceso rápido", Icon: PinOff, onSelect: () => a.quitar(f.id) },
  ];
}

/** Lo que el explorador le suma al menú de un archivo. */
export function extrasDelDoc(
  doc: DbDocument,
  a: {
    fijado: boolean;
    alternarFijado: (f: Fijado) => void;
    seleccionado: boolean;
    alternarSeleccion: (id: string) => void;
    usarComoIcono: (doc: DbDocument) => void;
  },
): ExtraDelMenu[] {
  const extras: ExtraDelMenu[] = [
    {
      id: "fijar",
      label: a.fijado ? "Quitar de Acceso rápido" : "Fijar en Acceso rápido",
      Icon: a.fijado ? PinOff : Pin,
      onSelect: () => a.alternarFijado({ tipo: "archivo", id: doc.id, nombre: doc.name }),
    },
    {
      id: "seleccion",
      label: a.seleccionado ? "Quitar de la selección" : "Seleccionar",
      Icon: CheckSquare,
      onSelect: () => a.alternarSeleccion(doc.id),
    },
  ];
  const esImagen = esImagenRenderizable(doc.name, doc.mimeType) || esImagenConvertible(doc.name, doc.mimeType);
  if (esImagen && doc.folderId) {
    extras.push({ id: "icono", label: "Usar de ícono de su carpeta", Icon: ImagePlus, onSelect: () => a.usarComoIcono(doc) });
  }
  return extras;
}
