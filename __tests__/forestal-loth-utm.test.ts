/**
 * loth-utm — la capa cartográfica del Libro TH.
 *
 * Lo que se blinda acá: si la proyección miente, el plano miente. Un árbol
 * censado en UTM que cae 200 m fuera del polígono por un error de conversión es
 * una bandera roja falsa en una fiscalización (o, peor, una real que no se ve).
 */
import { describe, expect, it } from "vitest";
import {
  bearingDeg,
  chooseGridStep,
  convexHull,
  distanceM,
  dominantZone,
  hullBuffer,
  formatDms,
  formatMeters,
  fromUtm,
  niceBarLength,
  niceScaleDenominator,
  parseUtmZone,
  perimeterM,
  toUtm,
  utmBandFromLat,
  utmGrid,
  utmZoneFromLng,
  vertexCode,
  zoneLabel,
} from "@/lib/forestal/loth-utm";
import { pointInPolygon, polygonAreaHa, type LatLng } from "@/lib/forestal/loth-geo";

describe("husos y bandas", () => {
  it("ubica la selva central peruana en la zona 18", () => {
    expect(utmZoneFromLng(-75.02)).toBe(18);
    expect(utmZoneFromLng(-74.55)).toBe(18);
    expect(utmZoneFromLng(-71.0)).toBe(19); // Puno
    expect(utmZoneFromLng(-79.0)).toBe(17); // Piura
  });

  it("asigna la banda MGRS correcta", () => {
    // Banda L = −16°…−8° (la que usa el censo de Ucayali: "18L").
    expect(utmBandFromLat(-8.93)).toBe("L");
    expect(utmBandFromLat(-9.85)).toBe("L");
    expect(utmBandFromLat(-16.5)).toBe("K");
    expect(utmBandFromLat(-3.74)).toBe("M"); // Iquitos
  });

  it("interpreta la zona como la escribe el regente", () => {
    expect(parseUtmZone("18L")).toEqual({ zone: 18, south: true });
    expect(parseUtmZone("18 S")).toEqual({ zone: 18, south: true }); // jerga local
    expect(parseUtmZone("18")).toEqual({ zone: 18, south: true });
    expect(parseUtmZone("31U")).toEqual({ zone: 31, south: false });
    expect(parseUtmZone(null)).toEqual({ zone: 18, south: true });
  });

  it("elige el huso dominante del conjunto", () => {
    expect(dominantZone([[-8.9, -74.5], [-8.8, -74.6], [-13.5, -71.9]])).toBe(18);
    expect(zoneLabel(18, true)).toBe("18S");
  });
});

describe("proyección UTM ↔ geográficas", () => {
  it("proyecta un árbol del censo (18L 545200E 9012410N) a la selva de Ucayali", () => {
    const [lat, lng] = fromUtm(545_200, 9_012_410, 18, true);
    // Contraste independiente: 10.000.000−9.012.410 = 987.590 m al sur del ecuador
    // ⇒ ≈ −8,93°; 45.200/0,9996 m al este del meridiano central (−75°) ⇒ ≈ −74,59°.
    expect(lat).toBeCloseTo(-8.9341, 3);
    expect(lng).toBeCloseTo(-74.5888, 3);
    // Y la ida devuelve exactamente la coordenada del regente (< 1 mm).
    const u = toUtm(lat, lng, 18);
    expect(u.easting).toBeCloseTo(545_200, 3);
    expect(u.northing).toBeCloseTo(9_012_410, 3);
  });

  it("ida y vuelta pierde menos de 1 cm", () => {
    const pts: LatLng[] = [
      [-8.9281, -74.5493],
      [-9.8549, -75.0213], // Ciudad Constitución
      [-12.0464, -77.0428], // Lima (zona 18 también)
      [-3.7437, -73.2516], // Iquitos
    ];
    for (const [lat, lng] of pts) {
      const u = toUtm(lat, lng);
      const back = fromUtm(u.easting, u.northing, u.zone, u.south);
      expect(distanceM([lat, lng], back)).toBeLessThan(0.01);
    }
  });

  it("respeta el falso este/norte del hemisferio sur", () => {
    const u = toUtm(-9.8549, -75.0213);
    expect(u.zone).toBe(18);
    expect(u.south).toBe(true);
    expect(u.easting).toBeGreaterThan(100_000);
    expect(u.easting).toBeLessThan(900_000);
    expect(u.northing).toBeGreaterThan(8_800_000);
    expect(u.northing).toBeLessThan(10_000_000);
  });

  it("mantiene el mismo huso cuando se fuerza (un plano = una cuadrícula)", () => {
    const forced = toUtm(-9.85, -72.0, 18); // longitud de zona 19 proyectada en 18
    expect(forced.zone).toBe(18);
    expect(forced.easting).toBeGreaterThan(800_000); // se va al borde, pero es continuo
  });
});

describe("medidas del polígono", () => {
  const cuadra: LatLng[] = [
    [-9.0, -75.0],
    [-9.0, -74.99],
    [-9.01, -74.99],
    [-9.01, -75.0],
  ];

  it("mide distancias y perímetro en metros", () => {
    // 0,01° de longitud en la latitud −9 ≈ 1,10 km
    expect(distanceM([-9, -75], [-9, -74.99])).toBeGreaterThan(1_090);
    expect(distanceM([-9, -75], [-9, -74.99])).toBeLessThan(1_110);
    expect(perimeterM(cuadra)).toBeGreaterThan(4_300);
    expect(perimeterM(cuadra)).toBeLessThan(4_500);
  });

  it("calcula azimut cardinal", () => {
    expect(bearingDeg([-9, -75], [-8.99, -75])).toBeCloseTo(0, 0); // norte
    expect(bearingDeg([-9, -75], [-9, -74.99])).toBeCloseTo(90, 0); // este
  });
});

describe("cuadrícula y escala", () => {
  it("elige un paso legible según el área visible", () => {
    expect(chooseGridStep(5_000)).toBe(1_000);
    expect(chooseGridStep(50_000)).toBe(10_000);
    expect(chooseGridStep(500)).toBe(100);
  });

  it("genera líneas E y N dentro del bbox", () => {
    const { step, lines } = utmGrid({ latMin: -9.02, latMax: -8.98, lngMin: -75.02, lngMax: -74.98 }, 18);
    expect(step).toBeGreaterThan(0);
    expect(lines.some((l) => l.axis === "E")).toBe(true);
    expect(lines.some((l) => l.axis === "N")).toBe(true);
    for (const l of lines) {
      expect(l.value % step).toBe(0);
      expect(l.path.length).toBeGreaterThan(2);
    }
  });

  it("redondea la escala de la lámina hacia arriba", () => {
    // 3 km de terreno en 25,5 cm de papel ≈ 1:11.765 → 1:15.000
    expect(niceScaleDenominator(3_000, 25.5)).toBe(15_000);
    expect(niceBarLength(1_400)).toBe(1_000);
  });
});

describe("envolvente del censo", () => {
  it("devuelve el rectángulo que contiene la nube de árboles", () => {
    const nube: LatLng[] = [
      [-9.0, -75.0],
      [-9.0, -74.99],
      [-9.01, -74.99],
      [-9.01, -75.0],
      [-9.005, -74.995], // interior: NO debe quedar en el casco
    ];
    const hull = convexHull(nube);
    expect(hull).toHaveLength(4);
    expect(hull.some((p) => p[0] === -9.005 && p[1] === -74.995)).toBe(false);
  });

  it("dilata la envolvente con una franja de seguridad", () => {
    const ring: LatLng[] = [
      [-9.0, -75.0],
      [-9.0, -74.99],
      [-9.01, -74.99],
      [-9.01, -75.0],
    ];
    const bigger = hullBuffer(ring, 100);
    expect(perimeterM(bigger)).toBeGreaterThan(perimeterM(ring));
    // Todos los árboles originales quedan DENTRO del polígono sugerido.
    for (const v of ring) expect(pointInPolygon(v, bigger)).toBe(true);
  });

  it("da un área real aunque el censo esté alineado en una trocha", () => {
    // 4 árboles casi colineales: escalar desde el centroide daría una astilla.
    const trocha: LatLng[] = [
      [-9.0, -75.0],
      [-9.001, -74.999],
      [-9.002, -74.998],
      [-9.003, -74.997],
    ];
    const ring = hullBuffer(trocha, 60);
    expect(ring.length).toBeGreaterThanOrEqual(3);
    // Franja de 60 m alrededor de una línea de ~470 m ⇒ bastante más de 3 ha.
    expect(polygonAreaHa(ring)).toBeGreaterThan(3);
    for (const v of trocha) expect(pointInPolygon(v, ring)).toBe(true);
  });

  it("funciona incluso con un solo árbol (círculo)", () => {
    const ring = hullBuffer([[-9, -75]], 100);
    expect(ring.length).toBeGreaterThanOrEqual(8);
    expect(polygonAreaHa(ring)).toBeGreaterThan(2.5); // π·100² ≈ 3,14 ha
    expect(polygonAreaHa(ring)).toBeLessThan(3.2);
  });
});

describe("rótulos del plano", () => {
  it("numera vértices como el expediente", () => {
    expect(vertexCode(0)).toBe("C.001");
    expect(vertexCode(35)).toBe("C.036");
  });

  it("formatea metros con separador de miles", () => {
    expect(formatMeters(488_706.5727)).toBe("488 706.57");
    expect(formatMeters(9_012_410, 0)).toBe("9 012 410");
  });

  it("formatea grados en sexagesimal con hemisferio", () => {
    expect(formatDms(-9.8549, "lat")).toMatch(/^9°51'.* S$/);
    expect(formatDms(-75.0213, "lng")).toMatch(/ O$/);
  });
});
