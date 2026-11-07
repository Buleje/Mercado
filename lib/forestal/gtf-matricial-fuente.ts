/**
 * gtf-matricial-fuente — DE QUÉ guía se imprime en el talonario de la
 * matricial: una del Libro TH (`ForestGtf`) o la de salida de un despacho del
 * Libro CTP (27-10). El servidor decide con ella la forma (el dueño del
 * talonario) y, en la salida PDF/ESC-P, de dónde leer los valores.
 *
 * Los nombres de los parámetros son los que ya usaban las rutas para la guía
 * del Libro TH (`gtf` en el GET, `gtfId` en el PUT y la salida); el despacho
 * suma `despacho` / `despachoId`. Siempre uno de los dos, nunca ambos.
 * PURO y client-safe.
 */

export type GuiaDelTalonario = { tipo: "gtf"; id: string } | { tipo: "despacho"; id: string };

/** Query del GET de la forma (`RUTA_TALONARIO`). */
export const consultaTalonario = (g: GuiaDelTalonario): Record<string, string> =>
  g.tipo === "gtf" ? { gtf: g.id } : { despacho: g.id };

/** Cuerpo del PUT de la forma y query de la salida PDF/ESC-P. */
export const idsTalonario = (g: GuiaDelTalonario): { gtfId: string } | { despachoId: string } =>
  g.tipo === "gtf" ? { gtfId: g.id } : { despachoId: g.id };

/** La guía que nombran los parámetros de una ruta del talonario; null = ninguna (la forma de la empresa). */
export const guiaDeLosParametros = (gtf: string | null | undefined, despacho: string | null | undefined): GuiaDelTalonario | null =>
  gtf ? { tipo: "gtf", id: gtf } : despacho ? { tipo: "despacho", id: despacho } : null;

/** Mensaje del 400 cuando vienen los dos: no se adivina de cuál se habla. */
export const MENSAJE_GUIA_O_DESPACHO = "Indica una guía del Libro TH o un despacho del Libro CTP, no los dos.";
