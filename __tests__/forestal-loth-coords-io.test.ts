/**
 * loth-coords-io — el polígono casi nunca se dibuja: se pega desde el cuadro de
 * coordenadas del plan o se sube el KML del consultor. Si el parser se come un
 * vértice o confunde este con norte, la parcela aprobada queda mal representada.
 */
import { describe, expect, it } from "vitest";
import {
  buildKml,
  parseCoordText,
  parseGeoJson,
  parseGeometryFile,
  parseKml,
  verticesToUtmText,
} from "@/lib/forestal/loth-coords-io";
import { distanceM, toUtm } from "@/lib/forestal/loth-utm";
import type { LatLng } from "@/lib/forestal/loth-geo";

describe("pegar coordenadas UTM", () => {
  it("lee el cuadro tal como sale del expediente (con código de vértice)", () => {
    const r = parseCoordText(`VERTICE  ESTE  NORTE
C.001   545060.02   9012340.07
C.002   545064.56   9012317.22
C.003   545077.54   9012297.84`);
    expect(r.formato).toBe("utm");
    expect(r.vertices).toHaveLength(3);
    const u = toUtm(r.vertices[0][0], r.vertices[0][1], 18);
    expect(u.easting).toBeCloseTo(545_060.02, 1);
    expect(u.northing).toBeCloseTo(9_012_340.07, 1);
    expect(r.ignoradas).toHaveLength(0);
  });

  it("tolera separador de miles, coma decimal y prefijos E:/N:", () => {
    const r = parseCoordText("C.001 E: 545 060,02 N: 9 012 340,07\nC.002 E: 545064.56 N: 9012317.22");
    expect(r.vertices).toHaveLength(2);
    const u = toUtm(r.vertices[0][0], r.vertices[0][1], 18);
    expect(u.easting).toBeCloseTo(545_060.02, 0);
    expect(u.northing).toBeCloseTo(9_012_340.07, 0);
  });

  it("no se confunde con el orden norte/este", () => {
    const directo = parseCoordText("545060.02  9012340.07");
    const invertido = parseCoordText("9012340.07  545060.02");
    expect(distanceM(directo.vertices[0], invertido.vertices[0])).toBeLessThan(0.01);
  });

  it("respeta la zona declarada por el regente", () => {
    const z18 = parseCoordText("545060.02 9012340.07", "18L");
    const z19 = parseCoordText("545060.02 9012340.07", "19L");
    expect(z18.zone).toBe(18);
    expect(z19.zone).toBe(19);
    expect(distanceM(z18.vertices[0], z19.vertices[0])).toBeGreaterThan(100_000);
  });

  it("lee coordenadas geográficas decimales", () => {
    const r = parseCoordText("-8.93408 -74.58884\n-8.93500 -74.58700");
    expect(r.formato).toBe("geograficas");
    expect(r.vertices[0][0]).toBeCloseTo(-8.93408, 5);
    expect(r.vertices[0][1]).toBeCloseTo(-74.58884, 5);
  });

  it("descarta el vértice de cierre repetido", () => {
    const r = parseCoordText(`545060.02 9012340.07
545064.56 9012317.22
545077.54 9012297.84
545060.02 9012340.07`);
    expect(r.vertices).toHaveLength(3);
  });

  it("reporta las líneas que no pudo interpretar", () => {
    const r = parseCoordText("545060.02 9012340.07\nesto no es una coordenada 12\n545064.56 9012317.22");
    expect(r.vertices).toHaveLength(2);
    expect(r.ignoradas).toEqual(["esto no es una coordenada 12"]);
  });

  it("devuelve vacío sin romperse con basura", () => {
    expect(parseCoordText("").formato).toBe("vacio");
    expect(parseCoordText("hola\nqué tal").vertices).toHaveLength(0);
  });

  it("no cuenta el encabezado como línea ignorada", () => {
    const r = parseCoordText("VERTICE\tESTE\tNORTE\n545060.02\t9012340.07\n545064.56\t9012317.22");
    expect(r.vertices).toHaveLength(2);
    expect(r.ignoradas).toHaveLength(0);
  });
});

describe("archivos de geometría", () => {
  const geojson = JSON.stringify({
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [-74.5, -8.9] }, properties: {} },
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[[-74.6, -8.9], [-74.59, -8.9], [-74.59, -8.91], [-74.6, -8.91], [-74.6, -8.9]]],
        },
        properties: {},
      },
    ],
  });

  it("toma el polígono de una FeatureCollection e ignora los puntos", () => {
    const r = parseGeoJson(geojson);
    expect(r.formato).toBe("geojson");
    expect(r.vertices).toHaveLength(4); // cierre descartado
    expect(r.vertices[0]).toEqual([-8.9, -74.6]); // [lat, lng]
  });

  it("lee el <coordinates> de un KML de Google Earth", () => {
    const kml = `<?xml version="1.0"?><kml><Document><Placemark><Polygon><outerBoundaryIs><LinearRing>
      <coordinates>-74.6,-8.9,0 -74.59,-8.9,0 -74.59,-8.91,0 -74.6,-8.9,0</coordinates>
    </LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
    const r = parseKml(kml);
    expect(r.formato).toBe("kml");
    expect(r.vertices).toHaveLength(3);
  });

  it("enruta por extensión y por contenido", () => {
    expect(parseGeometryFile("umf.geojson", geojson).formato).toBe("geojson");
    expect(parseGeometryFile("umf.txt", "545060.02 9012340.07\n545064.56 9012317.22").formato).toBe("utm");
    expect(parseGeometryFile("cualquiera", geojson).formato).toBe("geojson");
  });
});

describe("exportar", () => {
  const ring: LatLng[] = [
    [-8.9, -74.6],
    [-8.9, -74.59],
    [-8.91, -74.59],
  ];

  it("genera un KML con el anillo cerrado y los puntos", () => {
    const kml = buildKml({ ring, name: "UMF PC 12", points: [{ lat: -8.905, lng: -74.595, name: "1-SHI" }] });
    expect(kml).toContain("<kml");
    expect(kml).toContain("UMF PC 12");
    expect(kml).toContain("1-SHI");
    // El anillo se cierra: 4 tuplas para 3 vértices.
    const coords = kml.match(/<coordinates>([\s\S]*?)<\/coordinates>/)?.[1].trim().split(/\s+/) ?? [];
    expect(coords).toHaveLength(4);
    expect(coords[0]).toBe(coords[3]);
  });

  it("escapa el XML del nombre", () => {
    expect(buildKml({ ring, name: 'UMF <"A&B">' })).not.toContain('<"A&B">');
  });

  it("ida y vuelta KML → parser conserva la geometría", () => {
    const back = parseKml(buildKml({ ring, name: "x" }));
    expect(back.vertices).toHaveLength(3);
    back.vertices.forEach((v, i) => expect(distanceM(v, ring[i])).toBeLessThan(0.01));
  });

  it("arma el cuadro de coordenadas en texto", () => {
    const txt = verticesToUtmText(ring, 18);
    expect(txt.split("\n")).toHaveLength(3);
    expect(txt).toMatch(/^C\.001\t\d+\.\d{2}\t\d+\.\d{2}$/m);
  });
});
