/**
 * Las opciones de un menú del explorador del Archivo (clic derecho de una
 * carpeta, un archivo, varios elementos o el fondo vacío). Un `submenu` abre
 * otro panel al costado (Ver ›, Ordenar por ›, Nuevo ›), como en Windows.
 */

import type { LucideIcon } from "@buleje/design-system/icons";

export type ItemMenu =
  | {
      tipo?: "accion";
      id: string;
      label: string;
      Icon?: LucideIcon;
      onSelect: () => void;
      /** Borra o saca algo: rojo y al final. */
      peligro?: boolean;
      /** Opción de un grupo excluyente (la vista actual, el orden): tilde. */
      marcado?: boolean;
      /** Opción principal (Abrir): en negrita, como en Windows. */
      principal?: boolean;
      deshabilitado?: boolean;
      /** Atajo de teclado que se muestra a la derecha («F2»). */
      atajo?: string;
    }
  | { tipo: "submenu"; id: string; label: string; Icon?: LucideIcon; items: readonly ItemMenu[]; deshabilitado?: boolean }
  | { tipo: "separador"; id: string }
  | { tipo: "titulo"; id: string; label: string };

export const SEP = (id: string): ItemMenu => ({ tipo: "separador", id });

/** Saca los separadores repetidos, del principio o del final (quedan al filtrar opciones). */
export function limpiarSeparadores(items: readonly ItemMenu[]): ItemMenu[] {
  const out: ItemMenu[] = [];
  for (const it of items) {
    if (it.tipo === "separador" && (out.length === 0 || out[out.length - 1].tipo === "separador")) continue;
    out.push(it);
  }
  while (out.length > 0 && out[out.length - 1].tipo === "separador") out.pop();
  return out;
}
