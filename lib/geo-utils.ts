/**
 * Geolocation utilities for the storefront / checkout flow.
 *
 * Centraliza las funciones puras que originalmente vivían en
 * `components/CheckoutModal.tsx`. Mantenlas libres de side effects
 * para que puedan ser testeadas aisladamente.
 */

/** Coordenadas por defecto — Pucallpa, Ucayali (sede Buleje). */
export const DEFAULT_STORE_LAT = -8.3791;
export const DEFAULT_STORE_LON = -74.5539;

/** Radio máximo de entrega en kilómetros. */
export const MAX_DELIVERY_KM = 5;

export type LatLon = { lat: number; lon: number };

/**
 * Extrae coordenadas de un string de ubicación que contenga "GPS: lat, lon".
 * Si no encuentra coordenadas, retorna los fallbacks o las coords del local.
 *
 * @example
 * coordsFromLocation("Jr. Ucayali 450, GPS: -8.3791, -74.5539");
 * // → { lat: -8.3791, lon: -74.5539 }
 */
export function coordsFromLocation(
  loc: string,
  fallbackLat?: number | null,
  fallbackLon?: number | null
): LatLon {
  const match = loc.match(/GPS:\s*([-\d.]+),\s*([-\d.]+)/);
  if (match) {
    return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
  }
  return {
    lat: fallbackLat ?? DEFAULT_STORE_LAT,
    lon: fallbackLon ?? DEFAULT_STORE_LON,
  };
}

/**
 * Distancia haversine en kilómetros entre dos puntos lat/lon.
 * Útil para validar que un cliente está dentro del radio de entrega.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Devuelve un texto humano con la ETA estimada para un slot de entrega.
 * Mantiene compatibilidad con la implementación previa del CheckoutModal.
 *
 * Usa la zona horaria America/Lima — crítico porque el server puede correr en UTC.
 */
export function getDeliveryETA(slotId: string, now: Date = new Date()): string {
  const limaNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Lima" })
  );
  const h = limaNow.getHours();
  const isOpen = h >= 8 && h < 20;

  switch (slotId) {
    case "lo-antes-posible":
      return isOpen ? "Estimado: ~30-45 min" : "Mañana a primera hora (8:00)";
    case "manana":
      return h < 12 ? "Hoy entre 8:00 - 12:00" : "Mañana entre 8:00 - 12:00";
    case "tarde":
      return h < 17 ? "Hoy entre 12:00 - 17:00" : "Mañana entre 12:00 - 17:00";
    case "noche":
      return h < 20 ? "Hoy entre 17:00 - 20:00" : "Mañana entre 17:00 - 20:00";
    default:
      return "";
  }
}

/**
 * Verifica si una ubicación con coordenadas GPS está dentro del radio de entrega.
 * Si la ubicación no incluye GPS, retorna `{ inZone: true }` (no podemos validar).
 */
export function isWithinDeliveryZone(
  location: string,
  storeLat: number = DEFAULT_STORE_LAT,
  storeLon: number = DEFAULT_STORE_LON,
  maxKm: number = MAX_DELIVERY_KM
): { inZone: boolean; distanceKm: number | null } {
  if (!location.includes("GPS:")) {
    return { inZone: true, distanceKm: null };
  }
  const coords = coordsFromLocation(location, storeLat, storeLon);
  const distance = haversineKm(storeLat, storeLon, coords.lat, coords.lon);
  return { inZone: distance <= maxKm, distanceKm: distance };
}
