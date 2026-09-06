/**
 * loth-utm — capa CARTOGRÁFICA del Libro TH: la matemática que convierte el mapa
 * interactivo (WGS84 lat/lng) en un plano oficial con el lenguaje que habla la
 * ARFFS/SERFOR: coordenadas **UTM · Datum WGS 84 · Zona 18S**, cuadrícula, tabla
 * de vértices (C.001, C.002…), perímetro y escala.
 *
 * POR QUÉ EXISTE:
 * el censo forestal (`ForestCensusTree.utmX/utmY/utmZona`) YA se registra en UTM
 * — es como el regente entrega el inventario — pero Leaflet/GeoJSON hablan
 * lat/lng. Sin esta conversión el censo no se puede dibujar y el plano no se
 * puede rotular. Acá viven las dos direcciones + los helpers de lámina.
 *
 * PURO y client-safe (sin DOM, sin `lib/db/*`, sin `Date.now`). Lo consumen el
 * mapa (`LothMapaCanvas`, `LothVerticesPanel`) y el plano imprimible
 * (`loth-plano-print`).
 *
 * Precisión: serie clásica de Snyder (USGS PP-1395) sobre el elipsoide WGS84 —
 * error < 1 m dentro de la zona, más que suficiente para un plano 1:25.000 y
 * para ubicar árboles censados. NO reemplaza un GPS geodésico ni el post-proceso
 * del regente: es representación, no levantamiento.
 */

import type { LatLng } from "./loth-geo";

// ── Elipsoide WGS84 + constantes UTM ─────────────────────────────────────────
const A = 6_378_137; // semieje mayor (m)
const F = 1 / 298.257223563; // achatamiento
const K0 = 0.9996; // factor de escala en el meridiano central
const E2 = F * (2 - F); // primera excentricidad²
const EP2 = E2 / (1 - E2); // segunda excentricidad²
const FALSE_EASTING = 500_000;
const FALSE_NORTHING = 10_000_000; // hemisferio sur

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Bandas de latitud MGRS (sin I ni O). C–M = sur, N–X = norte. */
const BANDS = "CDEFGHJKLMNPQRSTUVWX";

export interface UtmCoord {
  /** Huso UTM (1–60). Perú: 17, 18 o 19. */
  zone: number;
  /** Banda de latitud MGRS (ej. "L" para −16°…−8°). */
  band: string;
  /** true = hemisferio sur (northing con falso origen 10.000.000). */
  south: boolean;
  /** Este (m). */
  easting: number;
  /** Norte (m). */
  northing: number;
}

/** Huso UTM que le corresponde a una longitud. */
export function utmZoneFromLng(lng: number): number {
  const z = Math.floor((((lng + 180) % 360) + 360) % 360 / 6) + 1;
  return Math.min(60, Math.max(1, z));
}

/** Banda de latitud MGRS ("L", "M", "S"…). Fuera de −80/84 → "Z". */
export function utmBandFromLat(lat: number): string {
  if (lat < -80 || lat > 84) return "Z";
  const i = Math.floor((lat + 80) / 8);
  return BANDS[Math.min(BANDS.length - 1, Math.max(0, i))];
}

const centralMeridian = (zone: number) => (zone - 1) * 6 - 180 + 3;

/** Arco de meridiano desde el ecuador hasta φ (m). */
function meridianArc(phi: number): number {
  return (
    A *
    ((1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * E2 * E2 * E2) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 * E2) / 256 + (45 * E2 * E2 * E2) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 * E2 * E2) / 3072) * Math.sin(6 * phi))
  );
}

/**
 * WGS84 geográficas → UTM. `forceZone` mantiene todos los puntos en un mismo
 * huso (obligatorio en un plano: mezclar husos rompe la cuadrícula).
 */
export function toUtm(lat: number, lng: number, forceZone?: number): UtmCoord {
  const zone = forceZone ?? utmZoneFromLng(lng);
  const phi = rad(lat);
  const lam = rad(lng);
  const lam0 = rad(centralMeridian(zone));

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const N = A / Math.sqrt(1 - E2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = EP2 * cosPhi * cosPhi;
  // Diferencia de longitud normalizada a (−π, π] — evita el salto en el antimeridiano.
  let dLam = lam - lam0;
  while (dLam > Math.PI) dLam -= 2 * Math.PI;
  while (dLam < -Math.PI) dLam += 2 * Math.PI;
  const Aa = cosPhi * dLam;
  const M = meridianArc(phi);

  const easting =
    K0 *
      N *
      (Aa +
        ((1 - T + C) * Aa ** 3) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5) / 120) +
    FALSE_EASTING;

  let northing =
    K0 *
    (M +
      N *
        tanPhi *
        ((Aa * Aa) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * Aa ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6) / 720));

  const south = lat < 0;
  if (south) northing += FALSE_NORTHING;

  return { zone, band: utmBandFromLat(lat), south, easting, northing };
}

/** UTM → WGS84 geográficas [lat, lng]. */
export function fromUtm(easting: number, northing: number, zone: number, south: boolean): LatLng {
  const x = easting - FALSE_EASTING;
  const y = south ? northing - FALSE_NORTHING : northing;

  const M = y / K0;
  const mu = M / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const C1 = EP2 * cosPhi1 * cosPhi1;
  const T1 = tanPhi1 * tanPhi1;
  const N1 = A / Math.sqrt(1 - E2 * sinPhi1 * sinPhi1);
  const R1 = (A * (1 - E2)) / (1 - E2 * sinPhi1 * sinPhi1) ** 1.5;
  const D = x / (N1 * K0);

  const lat =
    phi1 -
    ((N1 * tanPhi1) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6) / 720);

  const lng =
    rad(centralMeridian(zone)) +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5) / 120) /
      cosPhi1;

  return [deg(lat), deg(lng)];
}

/**
 * Parsea la zona tal como la escribe el regente: "18L", "18 S", "18". La letra
 * es la BANDA MGRS (C–M = sur). En Perú todo es hemisferio sur, así que ante
 * ambigüedad (ej. "18S", que en MGRS es banda del norte pero en la jerga local
 * significa "zona 18 Sur") asumimos sur.
 */
export function parseUtmZone(raw: string | null | undefined, fallbackZone = 18): { zone: number; south: boolean } {
  const s = String(raw ?? "").trim().toUpperCase();
  const m = s.match(/(\d{1,2})\s*([A-Z])?/);
  if (!m) return { zone: fallbackZone, south: true };
  const zone = Math.min(60, Math.max(1, Number(m[1]) || fallbackZone));
  const band = m[2];
  // Banda N–X (excepto la "S" de la jerga local) ⇒ hemisferio norte.
  const south = !band || band === "S" || band < "N";
  return { zone, south };
}

/** Zona UTM dominante de un conjunto de puntos (moda) — la zona del plano. */
export function dominantZone(points: LatLng[], fallback = 18): number {
  if (points.length === 0) return fallback;
  const count = new Map<number, number>();
  for (const [, lng] of points) {
    const z = utmZoneFromLng(lng);
    count.set(z, (count.get(z) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** "18 L" / "18 S" — etiqueta de zona para el cajetín del plano. */
export function zoneLabel(zone: number, south: boolean): string {
  return `${zone}${south ? "S" : "N"}`;
}

/** Código de vértice del plano: 1 → "C.001". */
export function vertexCode(index: number): string {
  return `C.${String(index + 1).padStart(3, "0")}`;
}

/** Coordenada en estilo topográfico: "488 706.57" (sin coma decimal ambigua). */
export function formatMeters(v: number, decimals = 2): string {
  const [int, dec] = Math.abs(v).toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${v < 0 ? "-" : ""}${grouped}${dec ? `.${dec}` : ""}`;
}

/** "18L · E 545 200.00 · N 9 012 410.00" — lectura completa para popups. */
export function formatUtmFull(u: UtmCoord, decimals = 2): string {
  return `${u.zone}${u.band} · E ${formatMeters(u.easting, decimals)} · N ${formatMeters(u.northing, decimals)}`;
}

/** Grados decimales → "9°51'17.6\" S" (formato de carta). */
export function formatDms(value: number, axis: "lat" | "lng"): string {
  const hemi = axis === "lat" ? (value < 0 ? "S" : "N") : value < 0 ? "O" : "E";
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  return `${d}°${String(m).padStart(2, "0")}'${s.toFixed(1).padStart(4, "0")}" ${hemi}`;
}

// ── Distancias / perímetro ───────────────────────────────────────────────────

const R_EARTH = 6_371_008.8; // radio medio (m)

/** Distancia haversine entre dos puntos (m). */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Longitud de una polilínea ABIERTA (m) — traza de una vía, no un anillo. */
export function lineLengthM(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceM(path[i - 1], path[i]);
  return total;
}

/** Perímetro del anillo cerrado (m). */
export function perimeterM(ring: LatLng[]): number {
  if (ring.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i++) total += distanceM(ring[i], ring[(i + 1) % ring.length]);
  return total;
}

/** Rumbo geodésico A→B en grados (0 = norte) — columna "azimut" de la tabla. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = rad(a[0]);
  const φ2 = rad(b[0]);
  const Δλ = rad(b[1] - a[1]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

// ── Cuadrícula UTM ───────────────────────────────────────────────────────────

export interface GridLine {
  /** "E" = línea de Este constante (vertical) · "N" = Norte constante (horizontal). */
  axis: "E" | "N";
  /** Valor UTM de la línea (m). */
  value: number;
  /** Traza en lat/lng (segmentada para acompañar la curvatura). */
  path: LatLng[];
}

const GRID_STEPS = [50, 100, 250, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000];

/** Paso de cuadrícula que da ~4–8 líneas para el span visible (m). */
export function chooseGridStep(spanM: number): number {
  const target = spanM / 5;
  return GRID_STEPS.find((s) => s >= target) ?? GRID_STEPS[GRID_STEPS.length - 1];
}

/**
 * Cuadrícula UTM que cubre el bbox lat/lng dado, en el huso `zone`. Devuelve
 * también el paso elegido para rotular ("cuadrícula 1 km").
 */
export function utmGrid(
  bounds: { latMin: number; latMax: number; lngMin: number; lngMax: number },
  zone: number,
  stepM?: number,
): { step: number; lines: GridLine[] } {
  const corners: LatLng[] = [
    [bounds.latMin, bounds.lngMin],
    [bounds.latMin, bounds.lngMax],
    [bounds.latMax, bounds.lngMin],
    [bounds.latMax, bounds.lngMax],
  ];
  const south = bounds.latMin < 0;
  const utms = corners.map(([la, ln]) => toUtm(la, ln, zone));
  const eMin = Math.min(...utms.map((u) => u.easting));
  const eMax = Math.max(...utms.map((u) => u.easting));
  const nMin = Math.min(...utms.map((u) => u.northing));
  const nMax = Math.max(...utms.map((u) => u.northing));

  const step = stepM ?? chooseGridStep(Math.max(eMax - eMin, nMax - nMin));
  const lines: GridLine[] = [];
  const SEG = 8; // segmentos por línea (la proyección no es recta en lat/lng)

  for (let e = Math.ceil(eMin / step) * step; e <= eMax; e += step) {
    const path: LatLng[] = [];
    for (let i = 0; i <= SEG; i++) path.push(fromUtm(e, nMin + ((nMax - nMin) * i) / SEG, zone, south));
    lines.push({ axis: "E", value: e, path });
  }
  for (let n = Math.ceil(nMin / step) * step; n <= nMax; n += step) {
    const path: LatLng[] = [];
    for (let i = 0; i <= SEG; i++) path.push(fromUtm(eMin + ((eMax - eMin) * i) / SEG, n, zone, south));
    lines.push({ axis: "N", value: n, path });
  }
  return { step, lines };
}

/** Rótulo corto de una línea de cuadrícula: 545000 → "545 km" / "545 200". */
export function gridLabel(value: number, step: number): string {
  if (step >= 1_000 && value % 1_000 === 0) return `${(value / 1_000).toFixed(0)} km`;
  return formatMeters(value, 0);
}

// ── Envolvente del censo (sugerencia de parcela) ─────────────────────────────

/**
 * Envolvente convexa (monotone chain) sobre lat/lng. Para un área de
 * aprovechamiento (pocos km) la distorsión es despreciable frente al uso: dar
 * un polígono de arranque a partir del censo, que el titular ajusta a mano.
 */
export function convexHull(points: LatLng[]): LatLng[] {
  const pts = [...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values()].sort(
    (a, b) => a[1] - b[1] || a[0] - b[0],
  );
  if (pts.length < 3) return pts;
  const cross = (o: LatLng, a: LatLng, b: LatLng) =>
    (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);

  const lower: LatLng[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: LatLng[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Envolvente convexa DILATADA `meters`: rodea cada punto con un círculo de ese
 * radio y toma el casco de todos esos puntos. A diferencia de escalar el anillo
 * desde el centroide, esto funciona aunque los árboles estén alineados (censo en
 * una trocha) o sean solo dos: siempre devuelve un área real, nunca una astilla.
 */
export function hullBuffer(points: LatLng[], meters: number, segments = 16): LatLng[] {
  if (points.length === 0) return [];
  if (meters <= 0) return convexHull(points);
  const cLat = points.reduce((a, p) => a + p[0], 0) / points.length;
  const mPerDegLat = 111_132;
  const mPerDegLng = 111_320 * Math.cos(rad(cLat));
  const ring: LatLng[] = [];
  for (const [la, ln] of points) {
    for (let i = 0; i < segments; i++) {
      const t = (2 * Math.PI * i) / segments;
      ring.push([la + (meters * Math.cos(t)) / mPerDegLat, ln + (meters * Math.sin(t)) / mPerDegLng]);
    }
  }
  return convexHull(ring);
}

// ── Escala de la lámina ──────────────────────────────────────────────────────

const SCALE_DENOMS = [500, 1_000, 2_000, 2_500, 5_000, 10_000, 15_000, 20_000, 25_000, 50_000, 75_000, 100_000, 150_000, 200_000, 250_000, 500_000];

/**
 * Denominador de escala "redondo" para una lámina: cuántos metros de terreno
 * caben en el ancho impreso. `printWidthCm` = ancho útil del mapa en el papel.
 */
export function niceScaleDenominator(groundWidthM: number, printWidthCm: number): number {
  const exact = (groundWidthM * 100) / printWidthCm;
  return SCALE_DENOMS.find((d) => d >= exact) ?? Math.ceil(exact / 100_000) * 100_000;
}

/** Longitud "redonda" para la barra de escala gráfica (m), ≤ maxM. */
export function niceBarLength(maxM: number): number {
  const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1_000, 2_000, 2_500, 5_000, 10_000, 20_000, 50_000];
  let best = steps[0];
  for (const s of steps) if (s <= maxM) best = s;
  return best;
}

/** "1.4 km" / "850 m" — para la barra de escala y las distancias. */
export function formatDistance(m: number): string {
  return m >= 1_000 ? `${(m / 1_000).toFixed(m >= 10_000 ? 0 : 2)} km` : `${Math.round(m)} m`;
}
