/**
 * geo-area.ts — área de un polígono lat/lng en hectáreas, sin dependencias.
 * Fórmula geodésica esférica (la misma de L.GeometryUtil.geodesicArea): integra
 * el exceso esférico sobre la esfera terrestre. Precisa a escala de chacra.
 * Client-safe (JS puro) → sirve para calcular el área EN VIVO mientras se edita
 * el polígono en el mapa, sin ir al backend.
 */
const EARTH_RADIUS_M = 6378137;
const D2R = Math.PI / 180;

/** Área en m² de un anillo de coordenadas [lat, lng]. */
export function geodesicAreaM2(latlngs: [number, number][]): number {
  const n = latlngs.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [lat1, lng1] = latlngs[i];
    const [lat2, lng2] = latlngs[(i + 1) % n];
    area += (lng2 - lng1) * D2R * (2 + Math.sin(lat1 * D2R) + Math.sin(lat2 * D2R));
  }
  return Math.abs((area * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/** Área en hectáreas (m² / 10 000), redondeada a 2 decimales. */
export function geodesicAreaHa(latlngs: [number, number][]): number {
  return Math.round((geodesicAreaM2(latlngs) / 10_000) * 100) / 100;
}

/** Distancia en metros entre dos puntos [lat, lng] (haversine). */
export function haversineM(a: [number, number], b: [number, number]): number {
  const [lat1, lng1] = a, [lat2, lng2] = b;
  const dLat = (lat2 - lat1) * D2R, dLng = (lng2 - lng1) * D2R;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Formatea metros a "X m" o "Y.YY km". */
export function formatDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
}
