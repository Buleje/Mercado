/**
 * El SELLO de una foto de la carga (ADR-434): qué dice la franja que se quema
 * abajo de la imagen y el pie que la acompaña en pantalla y en el papel.
 *
 * PURO a propósito (sin canvas, sin `navigator`): el mismo texto lo escriben el
 * sello de la imagen (`sellar-imagen.ts`), la miniatura (`CtpFotosDelIngreso`) y
 * el papel de la guía (`ctp-fotos-papel.ts`). Si cada uno lo armara por su
 * cuenta, la foto diría «14:32» y el papel «14:33», y ante un fiscalizador eso
 * es exactamente la duda que la foto venía a despejar.
 */

import { formatDateNumeric, formatTime, formatWeekday } from "@/lib/format";
import type { FotoCarga } from "./fotos-carga";

/**
 * Cuánto puede tener la foto para que la ubicación del teléfono sea la suya.
 * El GPS dice dónde está el teléfono AHORA; una foto de la galería sacada hace
 * dos días en otro lado quedaría sellada en el patio. Pasado este margen el
 * sello dice que no registró lugar, en vez de afirmar uno falso.
 */
export const MARGEN_UBICACION_MS = 15 * 60 * 1000;

export interface DatosDelSello {
  /** Cuándo se sacó (ISO o Date). */
  tomadaEn: string | Date;
  /** Quién la sube (nombre de la sesión). */
  por?: string | null;
  lat?: number | null;
  lng?: number | null;
  precisionM?: number | null;
  /** N° de la guía a la que pertenece, si se sabe. */
  gtf?: string | null;
}

/** «jueves 25/09/2026 · 14:32» en hora de Lima, o `null` si la fecha no sirve. */
export function fechaHoraDelSello(v: string | Date | null | undefined): string | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return `${formatWeekday(d, { largo: true })} ${formatDateNumeric(d)} · ${formatTime(d)}`;
}

/** «-8.37912, -74.55321 ±12 m» — 5 decimales ≈ 1 m, que es lo que da un GPS de teléfono. */
export function coordenadasDelSello(lat?: number | null, lng?: number | null, precisionM?: number | null): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const base = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return precisionM != null && Number.isFinite(precisionM) && precisionM >= 0
    ? `${base} ±${Math.round(precisionM)} m`
    : base;
}

/**
 * Las tres líneas de la franja quemada en la imagen:
 *   1. «jueves 25/09/2026 · 14:32 (hora de Lima)»
 *   2. «Brandon Buleje · GTF 001-0012345»
 *   3. «-8.37912, -74.55321 ±12 m» o «Sin ubicación»
 */
export function lineasDelSello(d: DatosDelSello): string[] {
  const cuando = fechaHoraDelSello(d.tomadaEn) ?? "Fecha desconocida";
  const quien = d.por?.trim() || "Usuario sin nombre";
  const guia = d.gtf?.trim() ? ` · GTF ${d.gtf.trim()}` : "";
  const donde = coordenadasDelSello(d.lat, d.lng, d.precisionM) ?? "Sin ubicación";
  return [`${cuando} (hora de Lima)`, `${quien}${guia}`, donde];
}

/**
 * ¿La ubicación del teléfono vale para esta foto? Sólo si la foto es de hace
 * pocos minutos (cámara recién usada); una de galería vieja no lleva lugar.
 */
export function ubicacionVale(tomadaEnMs: number, ahoraMs: number): boolean {
  return Number.isFinite(tomadaEnMs) && ahoraMs - tomadaEnMs <= MARGEN_UBICACION_MS;
}

/**
 * Cuándo se sacó: la fecha del archivo si es creíble (no del futuro, no 0), o
 * ahora. Con la cámara, el archivo nace en ese momento; desde la galería, su
 * fecha es la de la foto, que es la verdad — sellarla con «ahora» sería falso.
 */
export function momentoDeLaFoto(lastModified: number | undefined, ahoraMs: number): number {
  if (!lastModified || !Number.isFinite(lastModified) || lastModified <= 0) return ahoraMs;
  // Un minuto de tolerancia por relojes desparejos entre cámara y navegador.
  if (lastModified > ahoraMs + 60_000) return ahoraMs;
  return lastModified;
}

/** Pie corto de la miniatura y del papel: «jue 25/09/2026 · 14:32 · Brandon». */
export function pieDeFoto(f: Pick<FotoCarga, "tomadaEn" | "subidaEn" | "por">): string {
  const partes = [fechaHoraDelSello(f.tomadaEn ?? f.subidaEn ?? null), f.por?.trim() || null].filter(
    (p): p is string => Boolean(p),
  );
  return partes.length > 0 ? partes.join(" · ") : "Sin fecha registrada";
}

/** Link a un mapa para ver dónde se sacó, o `null` si no hay lugar. */
export function urlMapaDeFoto(f: Pick<FotoCarga, "lat" | "lng">): string | null {
  if (f.lat == null || f.lng == null || !Number.isFinite(f.lat) || !Number.isFinite(f.lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${f.lat.toFixed(6)},${f.lng.toFixed(6)}`;
}

/**
 * La dirección COMPLETA de la foto, para un link que sale de la pantalla (Excel,
 * papel abierto en otra ventana). Las privadas son `/api/admin/forestal/fotos/ver…`
 * relativas: fuera del panel no significan nada sin el dominio. Siguen pidiendo
 * sesión — quien abre el link sin estar logueado no la ve, que es lo buscado.
 */
export function hrefAbsolutoDeFoto(src: string, origen?: string | null): string {
  if (!src.startsWith("/")) return src;
  const base = origen ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}${src}`;
}
