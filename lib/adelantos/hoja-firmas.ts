/**
 * Hoja de firmas del sábado (25-10) — lógica PURA, sin servidor ni DOM.
 *
 * En el aserradero la gente firma en papel: se imprime UNA hoja con varios
 * adelantos y la foto de la hoja firmada queda atada a CADA uno. No hay un tipo
 * de firma «en papel» en el registro (`AdelantoFirma` es PANTALLA/ENLACE/BACKFILL
 * y exige trazos o huella con su hash), así que NO se inventa una firma digital:
 * la foto es un documento del Archivo (ADR-502, sin schema) con estas etiquetas:
 *
 *   `hoja-firmas`                    → es una hoja firmada
 *   `hoja-firmas:<código>`           → cuál hoja
 *   `hoja-firmas-adelanto:<id>`      → a qué adelanto va (una por adelanto)
 *
 * Es otro prefijo que `adelanto:<id>` a propósito: ese es el del recibo PDF que
 * se manda por WhatsApp y el «reutilizar el recibo» lo buscaría.
 */

export const TAG_HOJA_FIRMAS = "hoja-firmas";
export const MAX_ADELANTOS_POR_HOJA = 40;
export const CARPETA_HOJAS_FIRMAS = ["Adelantos", "Hojas de firmas"] as const;
export const TEXTO_FIRMADO_EN_HOJA = "Firmado en hoja (foto)";

/** «HF-251025-K7QD»: se imprime en la cabecera y se escribe al subir la foto. */
export const REGEX_CODIGO_HOJA = /^HF-\d{6}-[A-Z0-9]{4}$/;

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function codigoDeHoja(fecha: Date, aleatorio: () => number = Math.random): string {
  const lima = new Date(fecha.getTime() - 5 * 3600_000); // Lima = UTC-5, sin horario de verano
  const yy = String(lima.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(lima.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(lima.getUTCDate()).padStart(2, "0");
  let sufijo = "";
  for (let i = 0; i < 4; i++) sufijo += ALFABETO[Math.floor(aleatorio() * ALFABETO.length)];
  return `HF-${yy}${mm}${dd}-${sufijo}`;
}

export const tagDeHojaAdelanto = (adelantoId: string): string => `${TAG_HOJA_FIRMAS}-adelanto:${adelantoId}`;
export const tagDeHojaCodigo = (codigo: string): string => `${TAG_HOJA_FIRMAS}:${codigo}`;

/** Lo que la lista necesita saber de la hoja firmada de un adelanto. */
export interface HojaFirmada {
  codigo: string;
  /** ISO de cuándo se subió la foto. */
  en: string;
  documentoId: string;
}

/** Del documento (sus etiquetas) a la hoja de cada adelanto que lleva. */
export function hojasDeDocumento(
  doc: { id: string; tags: readonly string[]; uploadedAt: Date },
): Array<{ adelantoId: string } & HojaFirmada> {
  const prefijoAdelanto = `${TAG_HOJA_FIRMAS}-adelanto:`;
  const prefijoCodigo = `${TAG_HOJA_FIRMAS}:`;
  const codigo = doc.tags.find((t) => t.startsWith(prefijoCodigo))?.slice(prefijoCodigo.length) ?? "";
  return doc.tags
    .filter((t) => t.startsWith(prefijoAdelanto))
    .map((t) => ({ adelantoId: t.slice(prefijoAdelanto.length), codigo, en: doc.uploadedAt.toISOString(), documentoId: doc.id }));
}

/** Un adelanto que espera su firma (lo que muestra el modal y lo que se imprime). */
export interface AdelantoParaHoja {
  id: string;
  codigo: string | null;
  persona: string;
  documento: string | null;
  /** ISO. */
  fecha: string;
  concepto: string;
  monto: number;
  saldo: number;
  moneda: string;
}

/** El concepto en una línea corta para el casillero de la hoja. */
export function conceptoParaHoja(notas: string | null | undefined, conceptoRecibido: string | null | undefined): string {
  const limpio = (notas ?? "").replace(/\s+/g, " ").trim();
  if (limpio) return limpio.length > 90 ? `${limpio.slice(0, 87)}…` : limpio;
  if (conceptoRecibido === "SERVICIO") return "Servicio";
  if (conceptoRecibido === "PRESTAMO") return "Préstamo";
  return "Adelanto";
}
