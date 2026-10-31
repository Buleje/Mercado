/**
 * Fotos que sube una máquina al Archivo, no una persona.
 *
 * El detector de personas de las cámaras (`Cámaras/Personas`) y las fotos de
 * asistencia (`Cámaras/Asistencia`) llegan de a cientos por día. En Blas son
 * 360 de 375 documentos: tapan los 15 papeles de verdad. Las vistas generales
 * del Archivo (Todos, Recientes, Favoritos, búsqueda, duplicados) las dejan
 * fuera; dentro de su carpeta, o con la etiqueta pedida, se ve todo.
 *
 * Client-safe (sin prisma): lo importan el módulo del drive, el hook y la ruta.
 */

import { TAG_FOTO_PERSONA } from "@/lib/camaras/personas-retencion";
import { TAG_FOTO_ASISTENCIA } from "@/lib/rrhh/asistencia-fotos";

/** Etiquetas que identifican una foto de máquina (única fuente). */
export const TAGS_FOTOS_DE_MAQUINA: readonly string[] = [TAG_FOTO_PERSONA, TAG_FOTO_ASISTENCIA];

/** Lo que devuelve `GET /api/admin/documents?conteo=1&tags=…`. */
export interface ConteoFotosDeMaquina {
  /** Fotos de máquina vivas que el rol puede ver. */
  total: number;
  /** Lo que pesan, para que el espacio usado siga cuadrando. */
  bytes: number;
  /** Cuántas hay por etiqueta (`personas`, `asistencia`). */
  porTag: Record<string, number>;
}

export const CONTEO_FOTOS_VACIO: ConteoFotosDeMaquina = { total: 0, bytes: 0, porTag: {} };

/** ¿Es una foto de máquina? (tiene alguna de las etiquetas de arriba). */
export function esFotoDeMaquina(d: { tags?: string[] | null }): boolean {
  return (d.tags ?? []).some((t) => TAGS_FOTOS_DE_MAQUINA.includes(t));
}

/**
 * Qué etiqueta abre «Ver fotos». Las fotos del detector viven en subcarpetas por
 * cámara (`Cámaras › Personas › Portón del patio`): la carpeta sola se ve vacía.
 * La etiqueta junta todas en una lista, con su «Quitar». Si sólo hay fotos de
 * asistencia, esa; si no hay ninguna, null.
 */
export function etiquetaParaVerFotos(
  porTag: Record<string, number>,
): { tag: string; label: string } | null {
  if ((porTag[TAG_FOTO_PERSONA] ?? 0) > 0) return { tag: TAG_FOTO_PERSONA, label: "fotos de las cámaras" };
  if ((porTag[TAG_FOTO_ASISTENCIA] ?? 0) > 0) return { tag: TAG_FOTO_ASISTENCIA, label: "fotos de asistencia" };
  return null;
}
