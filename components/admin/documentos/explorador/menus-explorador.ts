/**
 * Qué ofrece el clic derecho del explorador del Archivo sobre una carpeta o
 * algo fijado en el Acceso rápido, y lo que el explorador le suma al menú de
 * un archivo. El fondo y los archivos tienen su archivo (`menu-fondo`,
 * `menu-elemento`). Sólo lo que funciona contra lo que ya existe.
 */

import {
  ArrowDown, ArrowUp, CheckSquare, ClipboardPaste, Eye, FileArchive, FolderArchive, FolderOpen, FolderPlus, ImageOff, ImagePlus,
  Info, Link2, Palette, Pencil, Pin, PinOff, Scissors, Share2, Trash2, UserPlus,
} from "@buleje/design-system/icons";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { esImagenConvertible, esImagenRenderizable } from "@/lib/documents/tipos-archivo";
import { esTagDeVinculo } from "@/lib/documentos/terceros-vinculo";
import type { ExtraDelMenu } from "../MenuDocumento";
import { docDeIconoCarpeta } from "../folder-visuals";
import { SEP, type ItemMenu } from "./item-menu";
import type { Fijado } from "./use-acceso-rapido";

export type OrdenArchivo = "recent" | "name" | "type" | "size" | "expiry" | "relevancia";

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
  /** «Armar expediente»: la carpeta (y sus subcarpetas, si quieres) en UN PDF con portada e índice. */
  armarExpediente?: (f: DbDocumentFolder) => void;
  /** «Vincular a un tercero…» (o «Terceros vinculados…» si ya tiene): sólo si el rol puede etiquetar carpetas. */
  vincularTercero?: (f: DbDocumentFolder) => void;
  eliminar: (f: DbDocumentFolder) => void;
  cortar: (f: DbDocumentFolder) => void;
  /** Hay algo cortado: se ofrece «Pegar aquí» (lo mete en esta carpeta). */
  hayCortado: boolean;
  pegarEn: (f: DbDocumentFolder) => void;
  propiedades: (f: DbDocumentFolder) => void;
}

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
    SEP("s0"),
    { id: "cortar", label: "Cortar", Icon: Scissors, atajo: "Ctrl+X", onSelect: () => a.cortar(f) },
    ...(a.hayCortado ? [{ id: "pegar", label: "Pegar aquí", Icon: ClipboardPaste, onSelect: () => a.pegarEn(f) } satisfies ItemMenu] : []),
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
    ...(a.armarExpediente
      ? [{ id: "expediente", label: "Armar expediente (PDF)", Icon: FolderArchive, onSelect: () => a.armarExpediente?.(f) } satisfies ItemMenu]
      : []),
    ...(a.vincularTercero
      ? [{
          id: "tercero",
          label: (f.tags ?? []).some(esTagDeVinculo) ? "Terceros vinculados…" : "Vincular a un tercero…",
          Icon: UserPlus,
          onSelect: () => a.vincularTercero?.(f),
        } satisfies ItemMenu]
      : []),
    SEP("s3"),
    { id: "eliminar", label: "Eliminar", Icon: Trash2, peligro: true, atajo: "Supr", onSelect: () => a.eliminar(f) },
    { id: "propiedades", label: "Propiedades", Icon: Info, atajo: "Alt+Entrar", onSelect: () => a.propiedades(f) },
  );
  return items;
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
