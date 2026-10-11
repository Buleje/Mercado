/**
 * La ubicación en vivo del cliente viaja en las NOTAS del pedido (campo que
 * `POST /api/orders` ya recibe, hasta 1000 letras) como un renglón
 * «Mi ubicación: https://maps.google.com/?q=<lat>,<lng>». Sin campos nuevos en
 * el pedido ni en la base.
 *
 * En el checkout el enlace vive aparte (`state.address.ubicacionEnVivo`) y se
 * junta con las notas recién al armar el pedido: así no gasta el tope de 200
 * letras del «Mensaje especial» ni se rompe con sus atajos (Cumpleaños, Regalo…).
 * Funciones puras (sin React) para poder probarlas.
 */

import type { UbicacionEnVivo } from "@/lib/tienda-cliente/contrato";

export const ETIQUETA_UBICACION = "Mi ubicación:";

const ENLACE_MAPA = /^https:\/\/maps\.google\.com\/\?q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;

/** Las notas que se mandan: lo que escribió el cliente + el renglón de la ubicación. */
export function notasDelPedido(notas: string, enlace?: string | null): string {
  const texto = notas.trim();
  const valido = enlace && ENLACE_MAPA.test(enlace) ? `${ETIQUETA_UBICACION} ${enlace}` : "";
  return [texto, valido].filter(Boolean).join("\n");
}

/** La ubicación del enlace (para la imagen del pedido), o null si no es de Google Maps. */
export function ubicacionDeEnlace(enlace?: string | null): UbicacionEnVivo | null {
  const m = enlace?.match(ENLACE_MAPA);
  if (!m || !enlace) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // La precisión no viaja en el enlace: 0 = la imagen no dibuja «±… m».
  return { lat, lng, precision: 0, enlaceMapa: enlace, leidaEn: 0 };
}

/** `https://maps.google.com/?q=<lat>,<lng>` con 6 decimales (el mismo formato del kit). */
export function enlaceMapa(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * Para el servidor (`POST /api/orders`): quita de las notas todo renglón que
 * diga ser la ubicación («Mi ubicación: …») y NO sea un enlace de Google Maps
 * con coordenadas. Alguien que llama directo a la API no puede colar otro enlace
 * con la etiqueta que el negocio ya aprendió a abrir.
 */
export function sanearNotasUbicacion(notas: string | undefined): string | undefined {
  if (!notas) return notas;
  const renglones = notas.split("\n");
  const limpios = renglones.filter((l) => {
    const t = l.trim();
    if (!t.startsWith(ETIQUETA_UBICACION)) return true;
    return ENLACE_MAPA.test(t.slice(ETIQUETA_UBICACION.length).trim());
  });
  if (limpios.length === renglones.length) return notas;
  const texto = limpios.join("\n").trim();
  return texto || undefined;
}
