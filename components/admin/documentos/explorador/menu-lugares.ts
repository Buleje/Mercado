/**
 * «Lugares» de la barra de dirección del explorador del Archivo: lo mismo que
 * tiene el panel lateral (vistas, Acceso rápido, carpetas, inteligentes y
 * etiquetas) en un menú con submenús, para cuando el panel está escondido o en
 * el celular, donde no hay panel. Las carpetas van anidadas como en el árbol:
 * una carpeta con subcarpetas abre su rama, con «Abrir» primero.
 */

import {
  FileText, Folder, FolderArchive, FolderTree, Layers, PanelLeft, Pin, Plus, Sparkles, Tag, type LucideIcon,
} from "@buleje/design-system/icons";
import type { DbDocumentFolder } from "@/lib/types/documents";
import { limpiarSeparadores, SEP, type ItemMenu } from "./item-menu";

export interface DatosLugares {
  vistas: readonly { id: string; label: string; Icon: LucideIcon }[];
  vistaActiva: string;
  irAVista: (id: string) => void;
  fijados: readonly { id: string; nombre: string; esCarpeta: boolean }[];
  abrirFijado: (id: string) => void;
  hijos: ReadonlyMap<string | null, readonly DbDocumentFolder[]>;
  carpetaActiva: string | null;
  abrirCarpeta: (id: string) => void;
  inteligentes: readonly { id: string; nombre: string }[];
  inteligenteActiva: string | null;
  abrirInteligente: (id: string) => void;
  nuevaInteligente: () => void;
  etiquetas: () => void;
  /** Sin esto (pantalla angosta) no se ofrece: ahí el panel no se muestra. */
  panel?: { visible: boolean; alternar: () => void };
}

const porNombre = (a: DbDocumentFolder, b: DbDocumentFolder) => a.name.localeCompare(b.name, "es", { sensitivity: "base" });

/** Las carpetas de `padre` como opciones; las que tienen subcarpetas, como submenú. */
export function ramaDeCarpetas(
  padre: string | null,
  d: Pick<DatosLugares, "hijos" | "carpetaActiva" | "abrirCarpeta">,
  visto: Set<string> = new Set(),
): ItemMenu[] {
  return [...(d.hijos.get(padre) ?? [])].sort(porNombre).flatMap<ItemMenu>((f) => {
    // Un ciclo en los datos (A dentro de B dentro de A) no cuelga el menú.
    if (visto.has(f.id)) return [];
    visto.add(f.id);
    const sub = ramaDeCarpetas(f.id, d, visto);
    const abrir = { id: `abrir-${f.id}`, Icon: Folder, marcado: d.carpetaActiva === f.id, onSelect: () => d.abrirCarpeta(f.id) };
    if (sub.length === 0) return [{ ...abrir, label: f.name }];
    return [{
      tipo: "submenu",
      id: `rama-${f.id}`,
      label: f.name,
      Icon: Folder,
      items: [{ ...abrir, label: `Abrir «${f.name}»`, principal: true }, SEP(`s-${f.id}`), ...sub],
    }];
  });
}

export function itemsDeLugares(d: DatosLugares): ItemMenu[] {
  const carpetas = ramaDeCarpetas(null, d);
  const items: ItemMenu[] = [
    {
      tipo: "submenu",
      id: "vistas",
      label: "Vistas",
      Icon: Layers,
      items: d.vistas.map((v) => ({ id: `vista-${v.id}`, label: v.label, Icon: v.Icon, marcado: d.vistaActiva === v.id, onSelect: () => d.irAVista(v.id) })),
    },
    {
      tipo: "submenu",
      id: "acceso",
      label: "Acceso rápido",
      Icon: Pin,
      items: d.fijados.length > 0
        ? d.fijados.map((f) => ({ id: `fijado-${f.id}`, label: f.nombre, Icon: f.esCarpeta ? Folder : FileText, onSelect: () => d.abrirFijado(f.id) }))
        : [{ id: "acceso-vacio", label: "Fija algo con clic derecho › Fijar", deshabilitado: true, onSelect: () => undefined }],
    },
    {
      tipo: "submenu",
      id: "carpetas",
      label: "Carpetas",
      Icon: FolderTree,
      items: [
        { id: "raiz", label: "Archivo", Icon: FolderArchive, principal: true, marcado: d.vistaActiva === "all", onSelect: () => d.irAVista("all") },
        ...(carpetas.length > 0 ? [SEP("carpetas-s"), ...carpetas] : []),
      ],
    },
    {
      tipo: "submenu",
      id: "inteligentes",
      label: "Inteligentes",
      Icon: Sparkles,
      items: limpiarSeparadores([
        ...d.inteligentes.map<ItemMenu>((s) => ({ id: `inteligente-${s.id}`, label: s.nombre, Icon: Sparkles, marcado: d.inteligenteActiva === s.id, onSelect: () => d.abrirInteligente(s.id) })),
        SEP("inteligentes-s"),
        { id: "nueva-inteligente", label: "Nueva carpeta inteligente…", Icon: Plus, onSelect: d.nuevaInteligente },
      ]),
    },
    { id: "etiquetas", label: "Etiquetas…", Icon: Tag, onSelect: d.etiquetas },
  ];
  if (d.panel) items.push(SEP("s-panel"), { id: "panel", label: "Panel lateral", Icon: PanelLeft, marcado: d.panel.visible, onSelect: d.panel.alternar });
  return items;
}
