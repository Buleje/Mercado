/**
 * Geolocation utilities for the storefront / checkout flow.
 *
 * Centraliza las funciones puras que originalmente vivían en
 * `components/CheckoutModal.tsx`. Mantenlas libres de side effects
 * para que puedan ser testeadas aisladamente.
 */

/**
 * Obtiene la posición actual del dispositivo con fallback web.
 *
 * - En plataforma nativa (Android/iOS via Capacitor) usa `@capacitor/geolocation`
 *   a través de dynamic import para acceder a GPS nativo con permisos de app.
 * - En web usa `navigator.geolocation.getCurrentPosition` con timeout 8 s.
 *
 * La detección de plataforma nativa se hace via `window.Capacitor.isNativePlatform`
 * para evitar importar `@capacitor/core` como dependencia de tipos en el bundle web.
 *
 * @throws Error si no hay soporte de geolocalización o el usuario deniega permisos.
 *
 * @example
 * const pos = await getCurrentPosition();
 * console.log(pos.coords.latitude, pos.coords.longitude);
 */
export async function getCurrentPosition(): Promise<GeolocationPosition> {
  // Detección de runtime: Capacitor inyecta window.Capacitor en plataformas nativas.
  // Usamos acceso dinámico para no requerir @capacitor/core como dependencia de tipos.
  const isNative =
    typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Capacitor?.isNativePlatform?.() === true;

  if (isNative) {
    // Dynamic import: solo se resuelve en builds Capacitor (Android/iOS).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Geolocation } = (await import("@capacitor/geolocation" as any)) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pos: any = await Geolocation.getCurrentPosition({ timeout: 8000 });
    return {
      coords: {
        latitude: pos.coords.latitude as number,
        longitude: pos.coords.longitude as number,
        accuracy: pos.coords.accuracy as number,
        altitude: (pos.coords.altitude as number | null) ?? null,
        altitudeAccuracy: (pos.coords.altitudeAccuracy as number | null) ?? null,
        heading: (pos.coords.heading as number | null) ?? null,
        speed: (pos.coords.speed as number | null) ?? null,
      },
      timestamp: pos.timestamp as number,
    } as GeolocationPosition;
  }

  // Fallback web — envuelve el API basado en callbacks en una Promise.
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("navigator.geolocation no disponible"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30_000,
    });
  });
}

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
  return (
    parseGpsCoords(loc) ?? {
      lat: fallbackLat ?? DEFAULT_STORE_LAT,
      lon: fallbackLon ?? DEFAULT_STORE_LON,
    }
  );
}

/**
 * Versión estricta de {@link coordsFromLocation}: devuelve `null` cuando el
 * texto NO contiene un par "GPS: lat, lon" bien formado, en vez de caer a las
 * coords de la bodega. Úsalo para distinguir "tiene GPS real" de "no tiene":
 * un `customerLocation` con "GPS:" mal formado no debe fingir una ubicación
 * (ponía un pin en la bodega y marcaba el pedido como geolocalizado).
 */
export function parseGpsCoords(loc: string): LatLon | null {
  const match = loc.match(/GPS:\s*([-\d.]+),\s*([-\d.]+)/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lon = parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
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
