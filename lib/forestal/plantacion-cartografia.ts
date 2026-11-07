/**
 * plantacion-cartografia — vértices UTM del bloque → mapa + superficie.
 *
 * Cero matemática nueva: reusa `loth-utm.ts` (WGS84↔UTM, ya con la serie de
 * Snyder probada por el Libro TH) y `loth-geo.ts` (área esférica + centroide).
 * Este archivo sólo adapta esas piezas a la forma que usa el bloque de
 * plantación (vértices con `orden`, no un anillo lat/lng suelto).
 *
 * PURO y client-safe (sin DOM, sin `lib/db/*`).
 */

import { centroid, polygonAreaHa, type LatLng } from "./loth-geo";
import { dominantZone, fromUtm, parseUtmZone, perimeterM, toUtm, vertexCode } from "./loth-utm";

export interface VerticeBloque {
  id?: string;
  orden: number;
  zonaUtm?: string | null;
  este: number;
  norte: number;
}

/** Vértices ordenados → anillo lat/lng, para dibujar el polígono en el mapa. */
export function verticesToRing(vertices: VerticeBloque[], fallbackZone = 18): LatLng[] {
  return [...vertices]
    .sort((a, b) => a.orden - b.orden)
    .map((v) => {
      const { zone, south } = parseUtmZone(v.zonaUtm, fallbackZone);
      return fromUtm(v.este, v.norte, zone, south);
    });
}

export interface BloqueGeometria {
  ring: LatLng[];
  /** Superficie calculada desde los vértices — SIEMPRE distinta de la que
   *  declaró el operador (`superficieHa` del bloque): una es medida, la otra
   *  calculada. Nunca se pisan entre sí (§26 del pedido). */
  areaCalculadaHa: number | null;
  perimetroM: number | null;
  centroide: LatLng | null;
  /** Huso UTM dominante del conjunto — para rotular la tabla y el mapa. */
  zonaDominante: number;
}

/** Geometría derivada de los vértices de un bloque. `ring.length < 3` ⇒ no
 *  hay polígono todavía (0, 1 o 2 puntos cargados) — se avisa, no se inventa. */
export function geometriaBloque(vertices: VerticeBloque[], fallbackZone = 18): BloqueGeometria {
  const ring = verticesToRing(vertices, fallbackZone);
  const zonaDominante = ring.length ? dominantZone(ring, fallbackZone) : fallbackZone;
  if (ring.length < 3) {
    return { ring, areaCalculadaHa: null, perimetroM: ring.length === 2 ? perimeterM(ring) / 2 : null, centroide: centroid(ring), zonaDominante };
  }
  return {
    ring,
    areaCalculadaHa: polygonAreaHa(ring),
    perimetroM: perimeterM(ring),
    centroide: centroid(ring),
    zonaDominante,
  };
}

/** Tabla de vértices para la UI/impresión: código (C.001…) + UTM formateado. */
export function tablaVertices(vertices: VerticeBloque[]): { codigo: string; zonaUtm: string; este: number; norte: number }[] {
  return [...vertices]
    .sort((a, b) => a.orden - b.orden)
    .map((v, i) => ({
      codigo: vertexCode(i),
      zonaUtm: v.zonaUtm?.trim() || "18 S",
      este: v.este,
      norte: v.norte,
    }));
}

/** Convierte un punto tocado en el mapa (lat/lng) a UTM, para el vértice nuevo
 *  que agrega "+ Agregar vértice" desde el mapa. */
export function puntoAVertice(lat: number, lng: number, orden: number, forceZone?: number): VerticeBloque {
  const u = toUtm(lat, lng, forceZone);
  return { orden, zonaUtm: `${u.zone}${u.south ? "S" : "N"}`, este: Math.round(u.easting * 1000) / 1000, norte: Math.round(u.northing * 1000) / 1000 };
}

/** Centroide de VARIOS bloques a la vez — para centrar el mapa cuando hay más
 *  de uno. Ignora bloques sin geometría (todavía sin vértices). */
export function centroideConjunto(bloques: BloqueGeometria[]): LatLng | null {
  const puntos = bloques.map((b) => b.centroide).filter((c): c is LatLng => c !== null);
  if (!puntos.length) return null;
  const lat = puntos.reduce((a, p) => a + p[0], 0) / puntos.length;
  const lng = puntos.reduce((a, p) => a + p[1], 0) / puntos.length;
  return [lat, lng];
}
