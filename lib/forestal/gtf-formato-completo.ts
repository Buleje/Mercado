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

import { CATALOGO, hojaDeFabrica, type CatalogoFormato, type DisposicionHoja, type FormatoTalonario, type SeparadorFecha } from "./gtf-matricial-disposicion";
import { encabezadoDelTalonario, serieYNumero } from "./gtf-matricial-pantalla";
import { htmlConFormato, type HojaConFormato, type MarcaCopia } from "./gtf-matricial-print";
import type { PaginaTalonario } from "./gtf-matricial-valores";
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
  /** La marca «COPIA» cruzada y su pie (falta = sí): en hoja blanca no puede pasar por la guía del talonario. */
  copia?: boolean;
  /** Llenar nombre y documento del emisor con el Rep. Legal de la guía (falta = sí). */
  emisor?: boolean;
}

/** La marca de toda hoja con formato: la guía que vale para el transporte es la del talonario autorizado. */
export const MARCA_COPIA: MarcaCopia = {
  grande: "COPIA",
  pie: "COPIA · No vale para el transporte: la guía original es la del talonario autorizado",
};

export interface EmisorGuia {
  nombre: string;
  documento: string;
  cargo: string;
}

/**
 * Quién firma la guía: su Rep. Legal (el (8)) con el DNI que trae la ficha
 * de SERFOR. Sin representante, null: se escribe a mano, como en el talonario.
 */
export function emisorDeLaGuia(e: EntradasGuiaLoth): EmisorGuia | null {
  const nombre = (e.cuerpo.ficha?.representante ?? "").trim();
  if (!nombre) return null;
  const dni = (e.cuerpo.ficha?.representanteDni ?? "").trim();
  return { nombre, documento: /^\d{8}$/.test(dni) ? `DNI ${dni}` : dni, cargo: "Representante legal" };
}

/** Base del valor de 9 pt a 0,5 mm del punteado (la misma cuenta que las ranuras de la plantilla). */
const SOBRE_LINEA_9PT = 3.17;

/** Los datos del emisor sobre su punteado, centrados: (38)-(39) de la guía y (14)-(16) de la lista. */
const RANURAS_EMISOR: Record<FormatoTalonario, ReadonlyArray<{ dato: keyof EmisorGuia; label: string; desde: number; hasta: number; linea: number }>> = {
  guia: [
    { dato: "nombre", label: "(38) Nombres y Apellidos del Emisor", desde: 137, hasta: 193, linea: 270.8 },
    { dato: "documento", label: "(39) Documento de Identidad del Emisor", desde: 137, hasta: 193, linea: 284.6 },
  ],
  lista: [
    { dato: "nombre", label: "(14) Nombres y Apellidos del Emisor", desde: 116.5, hasta: 185, linea: 251.6 },
    { dato: "documento", label: "(15) Documento de Identidad del Emisor", desde: 25, hasta: 94, linea: 270.6 },
    { dato: "cargo", label: "(16) Cargo que desempeña el Emisor", desde: 116.5, hasta: 185, linea: 270.6 },
  ],
};

/** El emisor como campos más de la hoja: así lo dibujan igual el HTML (`cajasDeLaPagina`) y el PDF (`renglonesDeLaPagina`). */
function conEmisor(formato: FormatoTalonario, hoja: DisposicionHoja, cat: CatalogoFormato, em: EmisorGuia | null): { hoja: DisposicionHoja; cat: CatalogoFormato; valores: Record<string, string> } {
  const ranuras = em ? RANURAS_EMISOR[formato].filter((r) => em[r.dato]) : [];
  if (!em || ranuras.length === 0) return { hoja, cat, valores: {} };
  const campos = { ...hoja.campos };
  const defs = [...cat.campos];
  const valores: Record<string, string> = {};
  for (const r of ranuras) {
    const id = `emisor:${r.dato}`;
    const pos = { x: r.desde, y: Math.round((r.linea - SOBRE_LINEA_9PT) * 10) / 10, anchoMm: r.hasta - r.desde, letraPt: 9, alinea: "centro" as const };
    campos[id] = { ...pos, visible: true };
    defs.push({ id, label: r.label, grupo: "Emisor", x: pos.x, y: pos.y, ancho: pos.anchoMm, alinea: "centro" });
    valores[id] = em[r.dato];
  }
  return { hoja: { ...hoja, campos }, cat: { ...cat, campos: defs }, valores };
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
export function hojasConFormato(cuales: FormatoTalonario[], e: EntradasGuiaLoth, { titular, separador = {}, emisor = true }: OpcionesConFormato = {}): HojaConFormato[] {
  const out: HojaConFormato[] = [];
  const em = emisor ? emisorDeLaGuia(e) : null;
  for (const formato of cuales) {
    if (formato === "lista" && cuales.length > 1 && e.filas.length === 0) continue;
    const base = conAire(formato, { ...hojaDeFabrica(formato), separadorFecha: separador[formato] ?? "/" });
    const { hoja, cat, valores } = conEmisor(formato, base, CATALOGO[formato], em);
    for (const p of paginasDe(formato, e, base)) {
      const pagina: PaginaTalonario = { ...p, campos: { ...p.campos, ...valores } };
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
  return htmlConFormato(hojasConFormato(cuales, e, op), titulo, ESTILO_CON_FORMATO[op.tinta ?? "celeste"], op.copia === false ? null : MARCA_COPIA);
}
