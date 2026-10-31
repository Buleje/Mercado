/**
 * loth-mapa-coordenadas — el CUADRO DE COORDENADAS de un polígono, en el
 * lenguaje del expediente: VÉRTICE · ESTE · NORTE, más el lado y el azimut de
 * cada tramo, y su CSV.
 *
 * Lo leen la tabla del bloque «Cuadro de coordenadas UTM» y el menú Exportar
 * de la barra del mapa (copiar / CSV): si cada uno armara el suyo, la tabla y
 * el archivo podrían decir cosas distintas. Sin React; lo único que toca el
 * DOM es `descargarTexto`.
 */

import { polygonAreaHa, type LatLng } from "@/lib/forestal/loth-geo";
import { bearingDeg, distanceM, dominantZone, perimeterM, toUtm, vertexCode, zoneLabel } from "@/lib/forestal/loth-utm";

export interface FilaCoordenada {
  code: string;
  este: number;
  norte: number;
  lado: number;
  azimut: number;
}

export interface CuadroCoordenadas {
  zone: number;
  south: boolean;
  /** «18L», «18S»: la etiqueta que va en el cajetín. */
  zona: string;
  rows: FilaCoordenada[];
  areaHa: number;
  perimKm: number;
}

export function cuadroDeCoordenadas(vertices: LatLng[]): CuadroCoordenadas {
  const zone = dominantZone(vertices);
  const south = vertices.length > 0 ? vertices[0][0] < 0 : true;
  const rows = vertices.map((v, i) => {
    const u = toUtm(v[0], v[1], zone);
    const next = vertices[(i + 1) % vertices.length];
    return {
      code: vertexCode(i),
      este: u.easting,
      norte: u.northing,
      lado: vertices.length > 1 ? distanceM(v, next) : 0,
      azimut: vertices.length > 1 ? bearingDeg(v, next) : 0,
    };
  });
  return {
    zone,
    south,
    zona: zoneLabel(zone, south),
    rows,
    areaHa: vertices.length >= 3 ? polygonAreaHa(vertices) : 0,
    perimKm: vertices.length >= 3 ? perimeterM(vertices) / 1000 : 0,
  };
}

export function csvDeCoordenadas(c: CuadroCoordenadas): string {
  return [
    "vertice,este_m,norte_m,zona,datum,lado_m,azimut_grados",
    ...c.rows.map(
      (r) => `${r.code},${r.este.toFixed(2)},${r.norte.toFixed(2)},${c.zona},WGS84,${r.lado.toFixed(2)},${r.azimut.toFixed(2)}`,
    ),
  ].join("\n");
}

/** Descarga un texto como archivo (CSV, KML, GeoJSON). */
export function descargarTexto(contenido: string, archivo: string, mime: string): void {
  const blob = new Blob([contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = archivo;
  a.click();
  URL.revokeObjectURL(url);
}
