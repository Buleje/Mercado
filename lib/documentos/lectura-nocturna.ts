/**
 * Lectura de la noche (Brandon 24-10: «Leer todo y hallar vencimientos»).
 *
 * Cada noche el cron `documentos-leer-noche` lee los papeles que siguen sin
 * texto —primero los de las carpetas Esenciales, después el resto— y repasa
 * el texto ya guardado cuando el lector de fechas aprende algo nuevo. La fecha
 * que encuentra queda SÓLO como sugerencia (`ocrMetadata.sugerencias.expiresAt`):
 * el dueño la confirma con un toque en «Vencimientos encontrados». Sin
 * confirmar, ni el aviso por WhatsApp ni la campana la ven.
 *
 * Puro y sin `server-only`: lo usan el lector de la noche y sus tests.
 */

import { esEsencial } from "./esenciales";
import { esComprobanteDePago, leerVencimiento, type VencimientoLeido } from "./fecha-vencimiento";
import { conSubcarpetas, type CarpetaMin } from "./terceros-vinculo";
import { MARCA_DESC_PROPIA } from "@/lib/documents/texto-buscable";

/** Papeles por tienda y por noche: lo que no entra va la noche siguiente. */
export const TOPE_LECTURA_POR_TIENDA = 40;

/** Un papel que no se pudo leer 3 noches deja de intentarse (queda el motivo). */
export const MAX_INTENTOS_LECTURA = 3;

/** Quién firma lo que hace la lectura de la noche (actividad y `vencimientoLeido.origen`). */
export const ORIGEN_LECTURA_NOCHE = "lectura-noche";

export interface PapelParaLeer {
  id: string;
  folderId: string | null;
  uploadedAt: string | Date;
  /** Noches que ya se intentó leerlo sin éxito. */
  intentos: number;
}

const ms = (f: string | Date) => (typeof f === "string" ? Date.parse(f) : f.getTime()) || 0;

/**
 * El orden de lectura: lo que está en una carpeta Esencial (o en cualquiera de
 * sus subcarpetas) primero; después lo que menos veces falló; después lo más
 * nuevo. Así una licencia recién subida a Esenciales se lee esa misma noche
 * aunque el Archivo tenga cien papeles viejos sin leer.
 */
export function ordenarParaLeer<D extends PapelParaLeer>(docs: readonly D[], carpetas: readonly CarpetaMin[]): D[] {
  const esenciales = conSubcarpetas(carpetas.filter(esEsencial).map((c) => c.id), carpetas);
  const prioridad = (d: D) => (d.folderId && esenciales.has(d.folderId) ? 0 : 1);
  return [...docs].sort((a, b) => prioridad(a) - prioridad(b) || a.intentos - b.intentos || ms(b.uploadedAt) - ms(a.uploadedAt));
}

/** Cuántos de la lista están en Esenciales (para el reporte del cron). */
export function cuantosEnEsenciales(docs: readonly { folderId: string | null }[], carpetas: readonly CarpetaMin[]): number {
  const esenciales = conSubcarpetas(carpetas.filter(esEsencial).map((c) => c.id), carpetas);
  return docs.filter((d) => d.folderId && esenciales.has(d.folderId)).length;
}

/**
 * Lo que salió del papel dentro de `ocrText`, sin lo que agregó la IA
 * («[Descripción]», «[Datos]»…) ni lo que escribió una persona («[Mi
 * descripción]»): la fecha tiene que estar ESCRITA en el papel, no en el
 * resumen de un modelo que pudo equivocarse (ver `texto-buscable`).
 */
export function textoDelPapel(ocrText: string | null | undefined): string {
  const sinPropia = (ocrText ?? "").split(MARCA_DESC_PROPIA)[0];
  const corte = sinPropia.search(/\s*\n\n?\[(?:Descripción|Datos|Entidades|Etiquetas)\] /);
  return corte >= 0 ? sinPropia.slice(0, corte) : sinPropia;
}

type Objeto = Record<string, unknown>;
const esObjeto = (v: unknown): v is Objeto => typeof v === "object" && v !== null && !Array.isArray(v);

export interface SugerenciaDelTexto {
  /** ISO de la fecha sugerida. */
  expiresAt: string;
  /** Lo que queda en `ocrMetadata.vencimientoLeido`: de qué renglón salió y que NO se anotó. */
  vencimientoLeido: VencimientoLeido & { anotado: false; origen: string };
}

/**
 * La fecha que el lector encuentra HOY en un texto ya guardado. Null si no hay
 * ninguna o si es la que ya estaba sugerida (no se reescribe nada).
 *
 * Gana sobre la sugerencia de la IA: en la GTF de Blas la IA leyó «20 108 1 26»
 * como 2021-08-26 y el casillero dice 20/08/26. En un comprobante (factura,
 * boleta, recibo) no se sugiere nada: su «fecha de vencimiento» es la de
 * pagar, y el repaso de facturas viejas llenaba «Vencimientos encontrados» de
 * fechas que no son de un papel que vence.
 */
export function sugerenciaDelTextoLeido(doc: { ocrText: string | null; ocrMetadata: unknown }): SugerenciaDelTexto | null {
  const texto = textoDelPapel(doc.ocrText);
  const lectura = leerVencimiento(texto);
  if (!lectura) return null;
  const meta = esObjeto(doc.ocrMetadata) ? doc.ocrMetadata : {};
  const sugerencias = esObjeto(meta.sugerencias) ? meta.sugerencias : {};
  const yaSugerida = typeof sugerencias.expiresAt === "string" ? sugerencias.expiresAt.slice(0, 10) : null;
  if (yaSugerida === lectura.fecha.slice(0, 10)) return null;
  const structured = esObjeto(meta.structured) ? meta.structured : {};
  if (esComprobanteDePago(texto, typeof structured.docType === "string" ? structured.docType : null)) return null;
  return { expiresAt: lectura.fecha, vencimientoLeido: { ...lectura, anotado: false, origen: ORIGEN_LECTURA_NOCHE } };
}

/**
 * Cuánto tiempo le toca a cada tienda: lo que queda repartido entre las que
 * faltan, con un piso (un papel escaneado con OCR tarda ~10-20 s). Así la
 * primera tienda no se come la noche de las demás.
 */
export function presupuestoDeTienda(restanteMs: number, tiendasQueFaltan: number, pisoMs = 20_000): number {
  if (restanteMs <= 0) return 0;
  return Math.min(restanteMs, Math.max(pisoMs, Math.floor(restanteMs / Math.max(1, tiendasQueFaltan))));
}
