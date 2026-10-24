/**
 * El clic derecho en el espacio vacío del explorador del Archivo, como el del
 * Explorador de Windows: Ver ›, Ordenar por ›, Agrupar por ›, Deshacer, Nuevo ›,
 * Pegar, Seleccionar todo, Subir archivos, Actualizar y Propiedades.
 */

import {
  ArrowDownAZ, CheckCheck, ClipboardPaste, Eye, FileSpreadsheet, FileText, FolderPlus, Info, Layers,
  PanelLeft, Plus, RefreshCw, Undo2, Upload,
} from "@buleje/design-system/icons";
import { limpiarSeparadores, SEP, type ItemMenu } from "./item-menu";
import type { OrdenArchivo } from "./menus-explorador";
import { AGRUPACIONES, esAscendente, type AgruparPor } from "./orden-agrupar";
import { VISTAS_ARCHIVO, type VistaArchivo } from "./vista-archivo";

/** Los órdenes del menú (y del selector de la barra), en el orden de Windows. */
export const ORDENES_MENU: readonly { id: OrdenArchivo; label: string }[] = [
  { id: "name", label: "Nombre" },
  { id: "recent", label: "Fecha" },
  { id: "type", label: "Tipo" },
  { id: "size", label: "Tamaño" },
  { id: "expiry", label: "Vencimiento" },
  { id: "relevancia", label: "Más parecidos" },
];

export interface AccionesDelFondo {
  vista: VistaArchivo;
  cambiarVista: (v: VistaArchivo) => void;
  /** `null` = la vista de Tarjetas: el panel no se puede esconder ahí. */
  panelVisible: boolean | null;
  alternarPanel: () => void;
  orden: OrdenArchivo;
  cambiarOrden: (o: OrdenArchivo) => void;
  invertido: boolean;
  fijarInvertido: (si: boolean) => void;
  agruparPor: AgruparPor;
  cambiarAgrupar: (a: AgruparPor) => void;
  /** «Más parecidos» sólo tiene sentido buscando. */
  hayBusqueda: boolean;
  /** Fuera de una carpeta (Favoritos, Recientes…) no se crea ni se sube. */
  enCarpetas: boolean;
  etiquetaDeshacer: string | null;
  deshacer: () => void;
  hayCortado: boolean;
  pegar: () => void;
  hayElementos: boolean;
  seleccionarTodo: () => void;
  nuevaCarpeta: () => void;
  nuevoTexto: () => void;
  nuevaHoja: () => void;
  subir: () => void;
  actualizar: () => void;
  propiedades: () => void;
}

export function itemsDelFondoExplorador(a: AccionesDelFondo): ItemMenu[] {
  const asc = esAscendente(a.orden, a.invertido);
  const ver: ItemMenu[] = VISTAS_ARCHIVO.map((v) => ({
    id: `ver-${v.id}`,
    label: v.label,
    Icon: v.Icon,
    marcado: a.vista === v.id,
    onSelect: () => a.cambiarVista(v.id),
  }));
  if (a.panelVisible !== null) {
    ver.push(SEP("ver-s"), { id: "panel", label: "Panel lateral", Icon: PanelLeft, marcado: a.panelVisible, onSelect: a.alternarPanel });
  }

  const ordenar: ItemMenu[] = [
    ...ORDENES_MENU.filter((o) => o.id !== "relevancia" || a.hayBusqueda).map<ItemMenu>((o) => ({
      id: `orden-${o.id}`,
      label: o.label,
      marcado: a.orden === o.id,
      onSelect: () => a.cambiarOrden(o.id),
    })),
    SEP("orden-s"),
    { id: "asc", label: "Ascendente", marcado: asc, onSelect: () => { if (!asc) a.fijarInvertido(!a.invertido); } },
    { id: "desc", label: "Descendente", marcado: !asc, onSelect: () => { if (asc) a.fijarInvertido(!a.invertido); } },
  ];

  const agrupar: ItemMenu[] = AGRUPACIONES.map((g) => ({
    id: `agrupar-${g.id}`,
    label: g.label,
    marcado: a.agruparPor === g.id,
    onSelect: () => a.cambiarAgrupar(g.id),
  }));

  const items: ItemMenu[] = [
    { tipo: "submenu", id: "ver", label: "Ver", Icon: Eye, items: ver },
    { tipo: "submenu", id: "ordenar", label: "Ordenar por", Icon: ArrowDownAZ, items: ordenar },
    { tipo: "submenu", id: "agrupar", label: "Agrupar por", Icon: Layers, items: agrupar },
    SEP("s1"),
    {
      id: "deshacer",
      label: a.etiquetaDeshacer ?? "Deshacer",
      Icon: Undo2,
      atajo: "Ctrl+Z",
      deshabilitado: !a.etiquetaDeshacer,
      onSelect: a.deshacer,
    },
    SEP("s2"),
  ];
  if (a.enCarpetas) {
    items.push({
      tipo: "submenu",
      id: "nuevo",
      label: "Nuevo",
      Icon: Plus,
      items: [
        { id: "nueva-carpeta", label: "Carpeta", Icon: FolderPlus, onSelect: a.nuevaCarpeta },
        SEP("nuevo-s"),
        { id: "nuevo-texto", label: "Documento de texto", Icon: FileText, onSelect: a.nuevoTexto },
        { id: "nueva-hoja", label: "Hoja de cálculo", Icon: FileSpreadsheet, onSelect: a.nuevaHoja },
      ],
    });
  }
  if (a.hayCortado && a.enCarpetas) items.push({ id: "pegar", label: "Pegar", Icon: ClipboardPaste, atajo: "Ctrl+V", onSelect: a.pegar });
  items.push(
    { id: "todo", label: "Seleccionar todo", Icon: CheckCheck, atajo: "Ctrl+A", deshabilitado: !a.hayElementos, onSelect: a.seleccionarTodo },
    SEP("s3"),
  );
  if (a.enCarpetas) items.push({ id: "subir", label: "Subir archivos", Icon: Upload, onSelect: a.subir });
  items.push(
    { id: "actualizar", label: "Actualizar", Icon: RefreshCw, onSelect: a.actualizar },
    SEP("s4"),
    { id: "propiedades", label: "Propiedades", Icon: Info, atajo: "Alt+Entrar", onSelect: a.propiedades },
  );
  return limpiarSeparadores(items);
}
