/**
 * lib/chat/location.ts — Tanda 4 · Compartir ubicación en el hilo (Brandon
 * 2026-06-11).
 *
 * El cliente comparte su ubicación (GPS one-shot) para coordinar la entrega;
 * ambos lados ven un mini-mapa + botón "Abrir en Maps". Va en metadataJson
 * `{ location: { lat, lng, label? } }` (sin tocar schema, mismo patrón que el
 * resto de Tanda 2/4).
 *
 * El thumbnail es UNA tile de OpenStreetMap servida como <img> (CSP img-src
 * permite https:), con el pin posicionado por matemática slippy-map — sin
 * Leaflet, sin API key, sin iframe (frame-src lo bloquearía).
 */

export interface ChatLocation {
  lat: number;
  lng: number;
  label: string | null;
}

/** Extrae la ubicación de un metadataJson (o null). Valida rangos lat/lng. */
export function parseChatLocation(raw: string | null): ChatLocation | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as { location?: Record<string, unknown> };
    const l = m.location;
    if (!l) return null;
    const lat = Number(l.lat);
    const lng = Number(l.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return {
      lat,
      lng,
      label: typeof l.label === "string" && l.label.trim() ? l.label.trim().slice(0, 120) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Calcula la tile OSM que contiene el punto + la posición fraccional del pin
 * dentro de la tile (0–100%). Pure math (Web Mercator / slippy map), sin deps.
 */
export function osmTile(lat: number, lng: number, zoom = 15): {
  url: string;
  pinXPct: number;
  pinYPct: number;
} {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const xf = ((lng + 180) / 360) * n;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const xt = Math.floor(xf);
  const yt = Math.floor(yf);
  return {
    url: `https://tile.openstreetmap.org/${zoom}/${xt}/${yt}.png`,
    pinXPct: (xf - xt) * 100,
    pinYPct: (yf - yt) * 100,
  };
}

/** Link a Google Maps (abre la app de mapas del usuario). */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
