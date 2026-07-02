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
