/**
 * loth-geo — geometría + readiness EUDR del Libro TH. Puro, sin DB.
 * Cubre punto-en-polígono, área geodésica, normalización y el veredicto EUDR.
 */
import { describe, it, expect } from "vitest";
import {
  pointInPolygon,
  polygonAreaHa,
  normalizeParcela,
  computeEudrReadiness,
  buildEudrGeoJson,
  emptyParcela,
  hasParcela,
  ringToGeoJsonPolygon,
  geoJsonPolygonToRing,
  type LatLng,
  type OpForEudr,
} from "@/lib/forestal/loth-geo";

// Cuadrado ~1km de lado cerca de Ciudad Constitución (-9.9, -75.0).
const SQUARE: LatLng[] = [
  [-9.905, -75.005],
  [-9.905, -74.995],
  [-9.895, -74.995],
  [-9.895, -75.005],
];
const parcelaSquare = { ...emptyParcela(), vertices: SQUARE, deforestacionCero: true };

describe("pointInPolygon", () => {
  it("un punto en el centro cae dentro", () => {
    expect(pointInPolygon([-9.9, -75.0], SQUARE)).toBe(true);
  });
  it("un punto afuera cae fuera", () => {
    expect(pointInPolygon([-9.8, -75.0], SQUARE)).toBe(false);
  });
  it("polígono degenerado (<3 vértices) siempre false", () => {
    expect(pointInPolygon([-9.9, -75.0], [[-9.9, -75.0]])).toBe(false);
  });
});

describe("polygonAreaHa", () => {
  it("un cuadrado de ~1.1km × ~1.1km da ~110-125 ha", () => {
    const ha = polygonAreaHa(SQUARE);
    // 0.01° lat ≈ 1.11 km; 0.01° lng en -9.9° ≈ 1.09 km → ~121 ha.
    expect(ha).toBeGreaterThan(100);
    expect(ha).toBeLessThan(140);
  });
  it("menos de 3 vértices → 0", () => {
    expect(polygonAreaHa([[-9.9, -75.0], [-9.9, -74.9]])).toBe(0);
  });
});

describe("normalizeParcela", () => {
  it("descarta 0,0 y coords fuera de rango, y colapsa <3 vértices a []", () => {
    const p = normalizeParcela({ vertices: [[0, 0], [200, -75], [-9.9, -75.0]], nota: "  PCA  " });
    expect(p.vertices).toHaveLength(0); // solo 1 válido → no llega a 3
    expect(p.nota).toBe("PCA");
  });
  it("conserva un polígono válido y la declaración", () => {
    const p = normalizeParcela({ vertices: SQUARE, deforestacionCero: true });
    expect(p.vertices).toHaveLength(4);
    expect(hasParcela(p)).toBe(true);
    expect(p.deforestacionCero).toBe(true);
  });
});

describe("computeEudrReadiness", () => {
  const opsListo: OpForEudr[] = [
    { section: "tala", lat: -9.9, lng: -75.0, cites: false },
    { section: "tala", lat: -9.9, lng: -74.999, cites: false },
    { section: "trozado", lat: -9.9, lng: -75.001, cites: false },
  ];

  it("todo geolocalizado dentro de la parcela declarada → listo, score 100", () => {
    const r = computeEudrReadiness(opsListo, parcelaSquare);
    expect(r.listo).toBe(true);
    expect(r.score).toBe(100);
    expect(r.fuera).toBe(0);
    expect(r.coberturaPct).toBe(100);
  });

  it("una tala sin GPS baja la cobertura y rompe el veredicto", () => {
    const r = computeEudrReadiness([...opsListo, { section: "tala", lat: null, lng: null, cites: false }], parcelaSquare);
    expect(r.talaTotal).toBe(3);
    expect(r.talaGeo).toBe(2);
    expect(r.listo).toBe(false);
  });

  it("una operación fuera del polígono es bandera roja", () => {
    const r = computeEudrReadiness([...opsListo, { section: "tala", lat: -9.7, lng: -75.0, cites: false }], parcelaSquare);
    expect(r.fuera).toBe(1);
    expect(r.checks.find((c) => c.key === "dentro")?.ok).toBe(false);
    expect(r.listo).toBe(false);
  });

  it("sin parcela declarada → no listo aunque haya GPS", () => {
    const r = computeEudrReadiness(opsListo, emptyParcela());
    expect(r.parcelaDeclarada).toBe(false);
    expect(r.listo).toBe(false);
    expect(r.score).toBeLessThan(100);
  });

  it("ignora operaciones anuladas", () => {
    const r = computeEudrReadiness(
      [...opsListo, { section: "tala", lat: -9.7, lng: -75.0, cites: false, status: "anulado" }],
      parcelaSquare,
    );
    expect(r.fuera).toBe(0);
    expect(r.talaTotal).toBe(2);
  });
});

describe("ring ↔ GeoJSON Polygon (editor de polígono del CTP)", () => {
  it("round-trip: anillo → GeoJSON → anillo devuelve los mismos vértices", () => {
    const back = geoJsonPolygonToRing(ringToGeoJsonPolygon(SQUARE));
    expect(back).toEqual(SQUARE);
  });
  it("ringToGeoJsonPolygon cierra el anillo en [lng,lat]", () => {
    const g = JSON.parse(ringToGeoJsonPolygon(SQUARE)) as { type: string; coordinates: number[][][] };
    expect(g.type).toBe("Polygon");
    const ring = g.coordinates[0];
    expect(ring).toHaveLength(SQUARE.length + 1); // cierre duplicado
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring[0]).toEqual([SQUARE[0][1], SQUARE[0][0]]); // [lng,lat]
  });
  it("geoJsonPolygonToRing tolera JSON corrupto o forma inválida", () => {
    expect(geoJsonPolygonToRing("{no json")).toEqual([]);
    expect(geoJsonPolygonToRing(null)).toEqual([]);
    expect(geoJsonPolygonToRing(JSON.stringify({ type: "Point", coordinates: [1, 2] }))).toEqual([]);
  });
});

describe("buildEudrGeoJson", () => {
  it("emite el polígono cerrado en [lng,lat] + un Point por operación", () => {
    const gj = buildEudrGeoJson({
      parcela: parcelaSquare,
      points: [{ lat: -9.9, lng: -75.0, section: "tala", code: "001-TOR", species: "Tornillo", cites: false, volumeM3: 2.5, date: "2026-01-10" }],
      titular: "Maderera Blas SAC",
    });
    const poly = gj.features.find((f) => f.geometry.type === "Polygon");
    expect(poly).toBeTruthy();
    const ring = (poly!.geometry as { coordinates: number[][][] }).coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]); // anillo cerrado
    expect(ring[0][0]).toBeLessThan(0); // lng primero (negativo en Perú)
    const pt = gj.features.find((f) => f.geometry.type === "Point");
    expect((pt!.properties as { codigo: string }).codigo).toBe("001-TOR");
  });
});
