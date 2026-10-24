/**
 * QA adversarial del frente EUDR — edge cases hostiles que un fiscalizador o un
 * operador torpe podrían disparar. Puro, sin DB.
 */
import { describe, it, expect } from "vitest";
import {
  pointInPolygon,
  polygonAreaHa,
  normalizeParcela,
  computeEudrReadiness,
  geoJsonPolygonToRing,
  ringToGeoJsonPolygon,
  buildEudrGeoJson,
  emptyParcela,
  type LatLng,
  type OpForEudr,
} from "@/lib/forestal/loth-geo";
import { computeCtpEudrReadiness, buildOriginsGeoJson, type OrigenRow, type OrigenGeo } from "@/lib/forestal/eudr-types";
import { buildEudrMapFigure } from "@/lib/forestal/eudr-map-figure";

describe("geo — entradas degeneradas no rompen ni mienten", () => {
  it("polígono de 1 punto repetido → área 0, no NaN", () => {
    const degenerate: LatLng[] = [[-9.9, -75], [-9.9, -75], [-9.9, -75]];
    expect(polygonAreaHa(degenerate)).toBe(0);
    expect(Number.isNaN(polygonAreaHa(degenerate))).toBe(false);
  });
  it("polígono auto-intersectante (reloj de arena) no crashea y da área finita", () => {
    const bowtie: LatLng[] = [[-9.9, -75], [-9.8, -74.9], [-9.9, -74.9], [-9.8, -75]];
    const a = polygonAreaHa(bowtie);
    expect(Number.isFinite(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
  });
  it("normalizeParcela descarta NaN/strings y colapsa a [] si quedan <3", () => {
    const p = normalizeParcela({ vertices: [["x", "y"], [null, 3], [-9.9, -75]] });
    expect(p.vertices).toEqual([]);
  });
  it("pointInPolygon con anillo vacío → false (no throw)", () => {
    expect(pointInPolygon([-9.9, -75], [])).toBe(false);
  });
  it("MultiPolygon o Point disfrazado de polígono → [] (no coords basura)", () => {
    expect(geoJsonPolygonToRing(JSON.stringify({ type: "MultiPolygon", coordinates: [[[[-75, -9.9]]]] }))).toEqual([]);
    expect(geoJsonPolygonToRing(JSON.stringify({ type: "Point", coordinates: [-75, -9.9] }))).toEqual([]);
    expect(geoJsonPolygonToRing("")).toEqual([]);
  });
  it("round-trip preserva un polígono de 3 vértices (mínimo legal)", () => {
    const tri: LatLng[] = [[-9.9, -75], [-9.8, -75], [-9.85, -74.9]];
    expect(geoJsonPolygonToRing(ringToGeoJsonPolygon(tri))).toEqual(tri);
  });
});

describe("readiness — números honestos en los bordes", () => {
  it("TH: parcela declarada pero CERO ops geolocalizadas → no miente 'listo'", () => {
    const parcela = { ...emptyParcela(), vertices: [[-9.9, -75], [-9.8, -75], [-9.85, -74.9]] as LatLng[], deforestacionCero: true };
    const r = computeEudrReadiness([{ section: "tala", lat: null, lng: null, cites: false }] as OpForEudr[], parcela);
    expect(r.parcelaDeclarada).toBe(true);
    expect(r.talaGeo).toBe(0);
    expect(r.listo).toBe(false); // parcela sí, cobertura no → NO listo
  });
  it("CTP: score nunca supera 100 ni baja de 0 con datos raros", () => {
    const origins: OrigenRow[] = [{ originCode: "A", ingresos: -5 }, { originCode: "B", ingresos: 999999 }];
    const geo: Record<string, OrigenGeo> = { A: { originCode: "A", lat: -9.9, lng: -75, deforestationFree: true }, B: { originCode: "B", lat: -9.8, lng: -74.9, deforestationFree: true } };
    const r = computeCtpEudrReadiness(origins, geo);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.coberturaPct).toBeLessThanOrEqual(100);
  });
});

describe("XSS — el código de origen malicioso se escapa en la figura y el GeoJSON", () => {
  it("buildEudrMapFigure escapa < > en el label del polígono", () => {
    const html = buildEudrMapFigure({ polygons: [{ code: '<script>alert(1)</script>', ring: [[-9.9, -75], [-9.8, -75], [-9.85, -74.9]] }] });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
  it("buildOriginsGeoJson pone el código crudo en JSON (no HTML) — seguro por serialización", () => {
    const origins: OrigenRow[] = [{ originCode: '<b>x</b>', ingresos: 1 }];
    const geo: Record<string, OrigenGeo> = { "<b>x</b>": { originCode: "<b>x</b>", lat: -9.9, lng: -75 } };
    const gj = buildOriginsGeoJson(origins, geo);
    // JSON.stringify no ejecuta HTML; el valor viaja como dato, no como markup.
    expect((gj.features[0].properties as { originCode: string }).originCode).toBe("<b>x</b>");
  });
});

describe("figura — bbox siempre válido (no pide a Esri un rango que da 500)", () => {
  it("un punto único fuerza el rango mínimo ~1.3km (no bbox de área 0)", () => {
    const html = buildEudrMapFigure({ points: [{ lat: -9.8549, lng: -75.0213 }] });
    const m = html.match(/bbox=([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)/);
    expect(m).toBeTruthy();
    const [, lngMin, latMin, lngMax, latMax] = m!.map(Number);
    expect(lngMax - lngMin).toBeGreaterThan(0.01); // ≥ MIN_RANGE
    expect(latMax - latMin).toBeGreaterThan(0.01);
  });
});
