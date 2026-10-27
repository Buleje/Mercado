/**
 * gtf-formato-completo — la GTF y su lista de trozas en hoja BLANCA, con el
 * formato entero dibujado (rótulos, franjas, rayas, casillas, el N° en rojo) y
 * cada valor en su renglón (Brandon 27-10: «imprimir con todos los campos, su
 * diseño todo en general… que todo esté recto y bien hecho»).
 *
 * A diferencia de «Imprimir en talonario» (sólo valores, en los mm que se
 * acomodaron para UN talonario y UNA impresora), acá papel y valores salen de
 * la MISMA plantilla: el formato en A4 y cada valor en su ranura de fábrica
 * (`hojaDeFabrica`), el punteado que sigue a su rótulo. Así nada queda corrido
 * aunque el acomodo del talonario lo esté: no hay papel preimpreso con el que
 * cuadrar. Del acomodo guardado sólo se toma el separador de la fecha.
 *
 * PURO y client-safe.
 */

import { CATALOGO, hojaDeFabrica, type DisposicionHoja, type FormatoTalonario, type SeparadorFecha } from "./gtf-matricial-disposicion";
import { encabezadoDelTalonario, serieYNumero } from "./gtf-matricial-pantalla";
import { htmlConFormato, type HojaConFormato } from "./gtf-matricial-print";
import { paginasDe } from "./gtf-matricial-valores";
import type { EntradasGuiaLoth } from "./loth-guia-print";
import { plantillaTalonario } from "./gtf-talonario-plantilla";
import { ESTILO_CON_FORMATO, type TintaFormato } from "./gtf-talonario-plantilla-svg";

export interface OpcionesConFormato {
  /** El titular del talonario (encabezado); falta = el (7) de la guía. */
  titular?: string | null;
  /** El separador de la fecha que eligió el dueño en su talonario. */
  separador?: Partial<Record<FormatoTalonario, SeparadorFecha>>;
  tinta?: TintaFormato;
}

/** Aire entre el rótulo impreso y su valor (la ranura de fábrica deja 0,6 mm: pegado a los dos puntos). */
const AIRE_TRAS_ROTULO_MM = 1.2;
/** Aire de cada celda contra sus rayas (la de fábrica deja 0,1 mm en el (34) y 0,6 en la lista: «Madera en rollo» tocaba «Trozas»). */
const AIRE_CELDA_MM = 1;
const AIRE_CELDA_FABRICA: Record<FormatoTalonario, number> = { guia: 0.1, lista: 0.6 };

/**
 * Las hojas a imprimir, guía primero. Pedida junto con la guía, la lista sale
 * sólo si la guía tiene trozas (una de transformados no la lleva); pedida
 * sola, sale aunque esté vacía.
 */
export function hojasConFormato(cuales: FormatoTalonario[], e: EntradasGuiaLoth, { titular, separador = {} }: OpcionesConFormato = {}): HojaConFormato[] {
  const out: HojaConFormato[] = [];
  for (const formato of cuales) {
    if (formato === "lista" && cuales.length > 1 && e.filas.length === 0) continue;
    const hoja = conAire(formato, { ...hojaDeFabrica(formato), separadorFecha: separador[formato] ?? "/" });
    const cat = CATALOGO[formato];
    for (const pagina of paginasDe(formato, e, hoja)) {
      const enc = encabezadoDelTalonario(formato, e, pagina, titular);
      /* En hoja blanca no hay folio de imprenta: la lista lleva el N° que le toca (aunque sea el de la guía), nunca «000000». */
      if (formato === "lista") enc.numero = serieYNumero(pagina.campos.numero ?? "").numero ?? enc.numero;
      out.push({ hoja, cat, pagina, plantilla: plantillaTalonario(formato, enc) });
    }
  }
  return out;
}

/**
 * Con aire: cada celda a `AIRE_CELDA_MM` de sus rayas (lo que no entra se
 * achica, `encajarValor`) y, en la guía, cada renglón a `AIRE_TRAS_ROTULO_MM`
 * de su rótulo. Casillas y fechas en partes, como están.
 */
function conAire(formato: FormatoTalonario, hoja: DisposicionHoja): DisposicionHoja {
  const celda = AIRE_CELDA_MM - AIRE_CELDA_FABRICA[formato];
  const columnas = Object.fromEntries(Object.entries(hoja.tabla.columnas).map(([id, c]) => [id, { ...c, x: c.x + celda, anchoMm: c.anchoMm - 2 * celda }]));
  const extra = AIRE_TRAS_ROTULO_MM - 0.6;
  const campos =
    formato === "guia"
      ? Object.fromEntries(Object.entries(hoja.campos).map(([id, c]) => [id, c.alinea === "izq" && c.anchoMm > 12 ? { ...c, x: c.x + extra, anchoMm: c.anchoMm - extra } : c]))
      : hoja.campos;
  return { ...hoja, campos, tabla: { ...hoja.tabla, columnas } };
}

export function htmlFormatoCompleto(cuales: FormatoTalonario[], e: EntradasGuiaLoth, titulo: string, op: OpcionesConFormato = {}): string {
  return htmlConFormato(hojasConFormato(cuales, e, op), titulo, ESTILO_CON_FORMATO[op.tinta ?? "celeste"]);
}
