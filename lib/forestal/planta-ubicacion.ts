/**
 * planta-ubicacion — dónde está parada cada pila, con coordenada propia.
 *
 * La primera versión guardaba `entryId → zonaId`: alcanzaba para decir «esta
 * troza está en el patio». Pero un patio de media hectárea tiene su orden —la
 * pila del fondo, la de la entrada— y el operador quiere poner el icono DONDE
 * está la pila, no donde la grilla lo dejó caer.
 *
 * Así que el valor pasó a ser `{ zonaId, lat, lng }`, con `lat/lng` opcionales:
 * sin coordenada, el mapa la reparte solo (como antes). Y lo ya guardado con el
 * formato viejo —un string suelto— **tiene que seguir cargando**: acá se
 * normalizan los dos, porque una preferencia que se descarta en silencio es una
 * troza que desaparece del mapa.
 *
 * PURO y client-safe (lo usa la clase DB y también el cliente para validar).
 */

/** Dónde está un ítem: su zona, y opcionalmente el punto exacto dentro de ella. */
export interface Ubicacion {
  zonaId: string;
  lat?: number;
  lng?: number;
}

const esLat = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 90;
const esLng = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 180;

/** Redondeo a 7 decimales: ~1 cm, de sobra para una pila de madera. */
export const redondearCoord = (n: number): number => Number(n.toFixed(7));

/**
 * Normaliza lo guardado en KV. Acepta el formato viejo (string con el id de la
 * zona) y el nuevo (objeto), y descarta lo que no se entienda — una entrada
 * corrupta no puede tirar el mapa entero.
 */
export function parsearUbicaciones(raw: unknown): Record<string, Ubicacion> {
  const out: Record<string, Ubicacion> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [entryId, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!entryId.trim()) continue;
    // Formato viejo: el valor ES el id de la zona.
    if (typeof v === "string") {
      const z = v.trim();
      if (z) out[entryId] = { zonaId: z };
      continue;
    }
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const zonaId = typeof o.zonaId === "string" ? o.zonaId.trim() : "";
    if (!zonaId) continue;
    const u: Ubicacion = { zonaId };
    // La coordenada sólo viaja si las DOS componentes son válidas: media
    // coordenada ubicaría la pila en el meridiano de Greenwich.
    if (esLat(o.lat) && esLng(o.lng)) {
      u.lat = redondearCoord(o.lat);
      u.lng = redondearCoord(o.lng);
    }
    out[entryId] = u;
  }
  return out;
}

/** Vista `entryId → zonaId`, que es lo que consume casi todo el módulo. */
export function soloZonas(ubis: Record<string, Ubicacion>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ubis)) out[k] = v.zonaId;
  return out;
}

/**
 * Aplica un cambio de ubicación sobre el mapa guardado.
 *
 * `zonaId: null` desubica. Mover dentro de la MISMA zona conserva todo lo demás;
 * cambiar de zona **borra la coordenada vieja** — un punto del patio de trozas
 * no significa nada dentro de la zona de despacho, y dejarlo pondría el icono
 * fuera de su polígono.
 */
export function aplicarUbicacion(
  ubis: Record<string, Ubicacion>,
  entryId: string,
  zonaId: string | null,
  pos?: { lat: number; lng: number } | null,
): Record<string, Ubicacion> {
  const id = entryId.trim();
  const out = { ...ubis };
  if (!id) return out;
  if (!zonaId) {
    delete out[id];
    return out;
  }
  const z = zonaId.trim();
  if (!z) return out;
  const previa = out[id];
  const mismaZona = previa?.zonaId === z;
  const u: Ubicacion = { zonaId: z };
  if (pos && esLat(pos.lat) && esLng(pos.lng)) {
    u.lat = redondearCoord(pos.lat);
    u.lng = redondearCoord(pos.lng);
  } else if (mismaZona && previa.lat != null && previa.lng != null) {
    u.lat = previa.lat;
    u.lng = previa.lng;
  }
  out[id] = u;
  return out;
}
