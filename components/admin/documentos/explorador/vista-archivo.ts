/**
 * Cómo se ve la sección Archivo del Drive (Brandon 16-10: «modos de vista como
 * el Explorador de Windows, y poder cambiar de uno a otro»).
 *
 * - `grid` = Tarjetas: la grilla de siempre, plana (todos los archivos).
 * - `grandes` / `medianos` / `lista` / `list` (Detalles) = explorador: se
 *   entra a las carpetas con doble clic y se ven sus subcarpetas.
 *
 * `list` conserva su nombre viejo porque es lo que ya quedó guardado en
 * `doc-view-mode` en los navegadores que venían usando la tabla.
 */

import { Grid3x3, LayoutGrid, List, Square, Table, type LucideIcon } from "@buleje/design-system/icons";

export type VistaArchivo = "grid" | "grandes" | "medianos" | "lista" | "list";
export type VistaIconos = "grandes" | "medianos" | "lista";

export const CLAVE_VISTA = "doc-view-mode";

export const VISTAS_ARCHIVO: readonly { id: VistaArchivo; label: string; Icon: LucideIcon }[] = [
  { id: "grandes", label: "Íconos grandes", Icon: Square },
  { id: "medianos", label: "Íconos medianos", Icon: Grid3x3 },
  { id: "lista", label: "Lista", Icon: List },
  { id: "list", label: "Detalles", Icon: Table },
  { id: "grid", label: "Tarjetas", Icon: LayoutGrid },
];

const IDS = new Set<string>(VISTAS_ARCHIVO.map((v) => v.id));

export function leerVista(raw: string | null | undefined): VistaArchivo {
  return raw && IDS.has(raw) ? (raw as VistaArchivo) : "grid";
}

/** Las vistas que navegan por carpetas (todas menos Tarjetas). */
export function esVistaExplorador(v: VistaArchivo): boolean {
  return v !== "grid";
}

/** Las tres que dibuja `VistaExplorador` (Detalles es la tabla de siempre). */
export function esVistaIconos(v: VistaArchivo): v is VistaIconos {
  return v === "grandes" || v === "medianos" || v === "lista";
}
