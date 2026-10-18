/**
 * El clic derecho sobre un archivo o sobre varios elementos elegidos en el
 * explorador del Archivo, como en Windows: Abrir en negrita, Cortar, Cambiar
 * nombre (F2), Eliminar (Supr) y Propiedades (Alt+Entrar), más todo lo que el
 * menú de siempre (`MenuDocumento`) ya hacía, ordenado en submenús.
 *
 * No hay «Copiar»: el Archivo no tiene cómo duplicar un archivo.
 */

import {
  Download, Eye, FileArchive, FileStack, Info, MessageCircle, PenLine, Pencil, RotateCw, Scissors,
  Stamp, Star, Tag, Trash2, Wand2, FolderInput,
} from "@buleje/design-system/icons";
import type { AccionesDocumento, EstadoDelMenu, ExtraDelMenu } from "../MenuDocumento";
import { limpiarSeparadores, SEP, type ItemMenu } from "./item-menu";

/** Lo del explorador (se deshace con Ctrl+Z); el resto viene de `MenuDocumento`. */
export interface AccionesDelElemento {
  cortar: () => void;
  renombrar: () => void;
  eliminar: () => void;
  propiedades: () => void;
}

/** `actual === null` = varios con estados distintos: no se marca ninguno. */
function itemsDeEstado(estados: readonly EstadoDelMenu[], actual: string | null, elegir: (clave: string) => void): ItemMenu[] {
  const items: ItemMenu[] = estados.map((s) => ({ id: `estado-${s.clave}`, label: s.label, marcado: actual === s.clave, onSelect: () => elegir(s.clave) }));
  const sinEstado = actual !== null && (!actual || actual === "none");
  items.push(SEP("estado-s"), { id: "estado-none", label: "Sin estado", marcado: sinEstado, onSelect: () => elegir("none") });
  return items;
}

export function itemsDelDoc(
  a: AccionesDocumento,
  x: AccionesDelElemento & { estados: readonly EstadoDelMenu[]; extras: readonly ExtraDelMenu[] },
): ItemMenu[] {
  const estadoActual = x.estados.find((s) => s.clave === a.status);
  const pdf: ItemMenu[] = [
    { id: "sello", label: "Poner sello", Icon: Stamp, onSelect: a.onStamp },
    { id: "rotar", label: "Rotar 90°", Icon: RotateCw, onSelect: a.onRotate },
    { id: "paginas", label: "Editar páginas", Icon: FileStack, onSelect: a.onEditPages },
    { id: "dividir", label: "Dividir en páginas", Icon: Scissors, onSelect: a.onSplit },
  ];
  return limpiarSeparadores([
    { id: "abrir", label: "Abrir", Icon: Eye, principal: true, atajo: "Entrar", onSelect: a.onPreview },
    { id: "cortar", label: "Cortar", Icon: Scissors, atajo: "Ctrl+X", onSelect: x.cortar },
    SEP("s1"),
    { id: "descargar", label: "Descargar", Icon: Download, onSelect: a.onDownload },
    { id: "whatsapp", label: "Enviar por WhatsApp", Icon: MessageCircle, onSelect: a.onWhatsApp },
    { id: "favorito", label: a.favorite ? "Quitar de favoritos" : "Marcar favorito", Icon: Star, onSelect: a.onToggleFav },
    ...x.extras.map<ItemMenu>((e) => ({ id: `extra-${e.id}`, label: e.label, Icon: e.Icon, onSelect: e.onSelect })),
    SEP("s2"),
    { id: "renombrar", label: "Cambiar nombre", Icon: Pencil, atajo: "F2", onSelect: x.renombrar },
    { id: "mover", label: "Mover a carpeta…", Icon: FolderInput, onSelect: a.onMove },
    { id: "etiquetar", label: "Etiquetar", Icon: Tag, onSelect: a.onTag },
    {
      tipo: "submenu",
      id: "estado",
      label: estadoActual ? `Estado: ${estadoActual.label}` : "Estado",
      items: itemsDeEstado(x.estados, a.status, a.onSetStatus),
    },
    SEP("s3"),
    { id: "analizar", label: "Analizar con IA", Icon: Wand2, onSelect: a.onAnalyze },
    { id: "firma", label: "Solicitar firma", Icon: PenLine, onSelect: a.onSign },
    ...(a.isPdf ? [{ tipo: "submenu", id: "pdf", label: "Herramientas de PDF", Icon: FileStack, items: pdf } satisfies ItemMenu] : []),
    SEP("s4"),
    { id: "eliminar", label: "Eliminar", Icon: Trash2, peligro: true, atajo: "Supr", onSelect: x.eliminar },
    { id: "propiedades", label: "Propiedades", Icon: Info, atajo: "Alt+Entrar", onSelect: x.propiedades },
  ]);
}

/** Lo que se puede hacer con varios archivos de una (la barra de acciones en lote). */
export interface AccionesLote {
  zip: () => void;
  whatsapp: () => void;
  favoritos: (si: boolean) => void;
  estado: (clave: string) => void;
}

export function itemsDeVarios(
  cuantos: { docs: number; carpetas: number },
  x: AccionesDelElemento & { lote: AccionesLote; estados: readonly EstadoDelMenu[] },
): ItemMenu[] {
  const total = cuantos.docs + cuantos.carpetas;
  const soloDocs = cuantos.carpetas === 0;
  const items: ItemMenu[] = [
    { tipo: "titulo", id: "t", label: `${total} elementos elegidos` },
    { id: "cortar", label: "Cortar", Icon: Scissors, atajo: "Ctrl+X", onSelect: x.cortar },
    SEP("s1"),
  ];
  if (cuantos.docs > 0) {
    const de = soloDocs ? "" : ` ${cuantos.docs} archivo${cuantos.docs === 1 ? "" : "s"}`;
    items.push(
      { id: "zip", label: `Descargar${de || ` los ${cuantos.docs}`} (ZIP)`, Icon: FileArchive, onSelect: x.lote.zip },
      { id: "whatsapp", label: `Enviar${de} por WhatsApp`, Icon: MessageCircle, onSelect: x.lote.whatsapp },
      { id: "favoritos", label: "Marcar favoritos", Icon: Star, onSelect: () => x.lote.favoritos(true) },
      { tipo: "submenu", id: "estado", label: "Estado", items: itemsDeEstado(x.estados, null, x.lote.estado) },
      SEP("s2"),
    );
  }
  items.push(
    { id: "eliminar", label: "Eliminar", Icon: Trash2, peligro: true, atajo: "Supr", onSelect: x.eliminar },
    { id: "propiedades", label: "Propiedades", Icon: Info, atajo: "Alt+Entrar", onSelect: x.propiedades },
  );
  return limpiarSeparadores(items);
}
