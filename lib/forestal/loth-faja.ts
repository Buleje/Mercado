/**
 * loth-faja — la FAJA MARGINAL de protección de los cuerpos de agua, dibujada
 * sobre el mapa.
 *
 * En un aprovechamiento forestal no se tumba hasta la orilla: a los lados de
 * ríos y quebradas queda una franja de protección (la faja marginal la fija la
 * ANA por cada cuerpo de agua; en los planes de manejo de selva se trabaja
 * habitualmente con ~50 m en ríos y ~30 m en quebradas). Acá el ancho es
 * PARÁMETRO — el sistema no inventa el número que corresponde a cada cauce.
 *
 * Geometría: el corredor se arma segmento por segmento (un rectángulo
 * perpendicular por tramo + un disco en cada vértice). No se hace unión
 * booleana: se dibujan las piezas superpuestas, que visualmente da el corredor
 * exacto y evita una librería de geometría entera. El ÁREA se informa como
 * largo × ancho, y se dice que es aproximada por eso mismo.
 *
 * PURO y client-safe.
 */

import type { LatLng } from "./loth-geo";
import { lineLengthM } from "./loth-utm";

/** Anchos de referencia (m a cada lado). Editables: la ANA fija el real. */
export const FAJA_SUGERIDA = { rio: 50, quebrada: 30 } as const;

const rad = (d: number) => (d * Math.PI) / 180;
const M_POR_GRADO_LAT = 111_132;
const mPorGradoLng = (lat: number) => 111_320 * Math.cos(rad(lat));

export interface FajaGeometria {
  /** Un polígono por tramo (el rectángulo perpendicular). */
  tramos: LatLng[][];
  /** Un círculo por vértice, para redondear los quiebres. */
  discos: { centro: LatLng; radioM: number }[];
  largoM: number;
  /** Superficie aproximada: largo × ancho total (sin descontar solapes). */
  areaHaAprox: number;
}

/**
 * Corredor de `anchoM` a CADA lado de la traza.
 *
 * El desplazamiento perpendicular se hace en metros y se convierte a grados en
 * la latitud de cada punto: a −9° un metro de longitud "vale" distinto que uno
 * de latitud, y usar grados planos deformaría la faja.
 */
export function construirFaja(traza: LatLng[], anchoM: number): FajaGeometria {
  const vacio: FajaGeometria = { tramos: [], discos: [], largoM: 0, areaHaAprox: 0 };
  const ancho = Number(anchoM);
  if (traza.length < 2 || !Number.isFinite(ancho) || ancho <= 0) return vacio;

  const tramos: LatLng[][] = [];
  for (let i = 0; i < traza.length - 1; i++) {
    const [lat1, lng1] = traza[i];
    const [lat2, lng2] = traza[i + 1];
    const latMed = (lat1 + lat2) / 2;
    const mLng = mPorGradoLng(latMed) || 1;

    // Vector del tramo en METROS.
    const dx = (lng2 - lng1) * mLng;
    const dy = (lat2 - lat1) * M_POR_GRADO_LAT;
    const largo = Math.hypot(dx, dy);
    if (largo < 0.01) continue;

    // Perpendicular unitaria (−dy, dx) escalada al ancho, de vuelta a grados.
    const px = (-dy / largo) * ancho;
    const py = (dx / largo) * ancho;
    const dLng = px / mLng;
    const dLat = py / M_POR_GRADO_LAT;

    tramos.push([
      [lat1 + dLat, lng1 + dLng],
      [lat2 + dLat, lng2 + dLng],
      [lat2 - dLat, lng2 - dLng],
      [lat1 - dLat, lng1 - dLng],
    ]);
  }

  const largoM = lineLengthM(traza);
  return {
    tramos,
    // Los extremos no llevan disco: la faja termina donde termina el cauce.
    discos: traza.slice(1, -1).map((centro) => ({ centro, radioM: ancho })),
    largoM: Number(largoM.toFixed(2)),
    areaHaAprox: Number(((largoM * ancho * 2) / 10_000).toFixed(4)),
  };
}

/** ¿El punto cae dentro de la faja? Distancia al segmento más cercano ≤ ancho. */
export function dentroDeFaja(punto: LatLng, traza: LatLng[], anchoM: number): boolean {
  return distanciaATraza(punto, traza) <= anchoM;
}

/**
 * Distancia (m) de un punto a la polilínea — proyección sobre cada segmento.
 * Se trabaja en metros locales: para las distancias de una faja (decenas de
 * metros) la aproximación plana es exacta a centímetros.
 */
export function distanciaATraza(punto: LatLng, traza: LatLng[]): number {
  if (traza.length === 0) return Number.POSITIVE_INFINITY;
  const [plat, plng] = punto;
  const mLng = mPorGradoLng(plat) || 1;
  const toXY = (p: LatLng): [number, number] => [(p[1] - plng) * mLng, (p[0] - plat) * M_POR_GRADO_LAT];

  if (traza.length === 1) {
    const [x, y] = toXY(traza[0]);
    return Math.hypot(x, y);
  }

  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < traza.length - 1; i++) {
    const [ax, ay] = toXY(traza[i]);
    const [bx, by] = toXY(traza[i + 1]);
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy;
    // t = proyección del punto (origen) sobre el segmento, recortada a [0,1].
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * vx + ay * vy) / len2));
    const cx = ax + t * vx;
    const cy = ay + t * vy;
    min = Math.min(min, Math.hypot(cx, cy));
  }
  return min;
}

/** Árboles del censo que caen dentro de la faja (no deberían aprovecharse). */
export function arbolesEnFaja<T extends { lat: number; lng: number }>(arboles: T[], traza: LatLng[], anchoM: number): T[] {
  if (traza.length < 2 || anchoM <= 0) return [];
  return arboles.filter((a) => distanciaATraza([a.lat, a.lng], traza) <= anchoM);
}
