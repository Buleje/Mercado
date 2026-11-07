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

/** Las vistas del riel que tienen secciones (`?sub=`): el `?sub=` es suyo y se borra al salir. */
export type VistaThConSubs = "tablero" | "cumplimiento" | "gtf";

export interface DestinoFusionadoTh {
  /** La vista del riel que absorbió a la vieja. */
  vista: VistaThConSubs | "rentabilidad";
  /** Su sección, si la vieja quedó como una (Rentabilidad absorbió a Analítica entera). */
  sub?: string;
}

/**
 * Nombre viejo → dónde vive hoy. Un enlace guardado, el del WhatsApp del monte
 * (`?vista=monte&trabajo=…`), un aviso o un `irA("cierre")` de otra pantalla
 * siguen llegando a su sección en vez de caer en Secciones sin decir nada.
 */
export const LOTH_VISTAS_FUSIONADAS: Readonly<Record<string, DestinoFusionadoTh>> = {
  analitica: { vista: "rentabilidad" },
  extraccion: { vista: "tablero", sub: "extraccion" },
  /* Compactación 17-10: 10 → 7 vistas. */
  trazabilidad: { vista: "tablero", sub: "arbol" },
  cierre: { vista: "cumplimiento", sub: "cerrar" },
  monte: { vista: "gtf", sub: "monte" },
};

/** Para `useVistaModulo`: el nombre viejo abre la vista que lo absorbió. */
export const ALIAS_FUSIONADAS_TH: Readonly<Record<string, DestinoFusionadoTh["vista"]>> = Object.fromEntries(
  Object.entries(LOTH_VISTAS_FUSIONADAS).map(([vieja, d]) => [vieja, d.vista]),
);

export function destinoFusionadoTh(vista: string): DestinoFusionadoTh | null {
  return Object.hasOwn(LOTH_VISTAS_FUSIONADAS, vista) ? LOTH_VISTAS_FUSIONADAS[vista] : null;
}
