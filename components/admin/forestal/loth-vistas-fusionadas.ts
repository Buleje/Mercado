/**
 * Secciones (`?sub=`) de las vistas del Libro TH que absorbieron a otra al compactarlo
 * (Brandon 17-10: «compactar el Libro TH», mismo patrón que `ctp-vistas-fusionadas.ts`).
 * Ninguna función se pierde: lo de la vista que se fue es una sección de la que queda,
 * y su dirección vieja llega acá por el alias del libro.
 *
 * Sin `server-only`: lo leen el libro, las vistas y los guardianes.
 */

/** Control del permiso: Trozas · Kárdex · Extracción + «Por árbol» (antes vista «trazabilidad»). */
export const SUBS_CONTROL = ["trozas", "kardex", "extraccion", "arbol"] as const;
export type SubControl = (typeof SUBS_CONTROL)[number];

/** Cumplimiento: el chequeo + «Cerrar el mes» (antes vista «cierre»). */
export const SUBS_CUMPLIMIENTO_TH = ["chequeo", "cerrar"] as const;
export type SubCumplimientoTh = (typeof SUBS_CUMPLIMIENTO_TH)[number];

/** GTF: guías · bajas (anuladas) + «Por imprimir» (antes vista «monte», conserva `&trabajo=`). */
export const SUBS_GTF = ["guias", "bajas", "monte"] as const;
export type SubGtf = (typeof SUBS_GTF)[number];
