/**
 * eudr-types — readiness a nivel planta + GeoJSON del dossier CTP. Puro, sin DB.
 */
import { describe, it, expect } from "vitest";
import {
  computeCtpEudrReadiness,
  buildOriginsGeoJson,
  type OrigenRow,
  type OrigenGeo,
} from "@/lib/forestal/eudr-types";
import { buildEudrMapFigure, eudrSignatureBlock } from "@/lib/forestal/eudr-map-figure";

const origins: OrigenRow[] = [
  { originCode: "CONC-A", originType: "concesión", region: "Ucayali", ingresos: 3 },
  { originCode: "CONC-B", originType: "predio", region: "Ucayali", ingresos: 1 },
];

describe("computeCtpEudrReadiness", () => {
  it("todos geolocalizados + sin deforestación → listo, score 100", () => {
    const geo: Record<string, OrigenGeo> = {
      "CONC-A": { originCode: "CONC-A", lat: -9.9, lng: -75.0, deforestationFree: true },
      "CONC-B": { originCode: "CONC-B", lat: -9.8, lng: -74.9, deforestationFree: true },
    };
    const r = computeCtpEudrReadiness(origins, geo);
    expect(r.listo).toBe(true);
    expect(r.score).toBe(100);
    expect(r.geolocalizados).toBe(2);
    expect(r.coberturaPct).toBe(100);
    expect(r.ingresosCubiertos).toBe(4);
  });

  it("un origen sin geo baja cobertura y rompe el veredicto", () => {
    const geo: Record<string, OrigenGeo> = {
      "CONC-A": { originCode: "CONC-A", lat: -9.9, lng: -75.0, deforestationFree: true },
    };
    const r = computeCtpEudrReadiness(origins, geo);
    expect(r.geolocalizados).toBe(1);
    expect(r.coberturaPct).toBe(50);
    expect(r.ingresosCubiertos).toBe(3);
    expect(r.listo).toBe(false);
  });

  it("geolocalizado pero sin atestar deforestación → no listo", () => {
    const geo: Record<string, OrigenGeo> = {
      "CONC-A": { originCode: "CONC-A", lat: -9.9, lng: -75.0, deforestationFree: false },
      "CONC-B": { originCode: "CONC-B", lat: -9.8, lng: -74.9, deforestationFree: false },
    };
    const r = computeCtpEudrReadiness(origins, geo);
    expect(r.checks.find((c) => c.key === "geo")?.ok).toBe(true);
    expect(r.checks.find((c) => c.key === "df")?.ok).toBe(false);
    expect(r.listo).toBe(false);
  });

  it("sin orígenes → score 0, no listo", () => {
    const r = computeCtpEudrReadiness([], {});
    expect(r.total).toBe(0);
    expect(r.score).toBe(0);
    expect(r.listo).toBe(false);
  });
});

describe("buildOriginsGeoJson", () => {
  it("emite un Point por origen geolocalizado en [lng,lat] + metadata del emisor", () => {
    const geo: Record<string, OrigenGeo> = {
      "CONC-A": { originCode: "CONC-A", lat: -9.9, lng: -75.0, deforestationFree: true },
      "CONC-B": { originCode: "CONC-B" }, // sin geo → se omite
    };
    const gj = buildOriginsGeoJson(origins, geo, { razonSocial: "Aserradero SAC", ruc: "20512345678" });
    expect(gj.features).toHaveLength(1);
    expect(gj.features[0].geometry.type).toBe("Point");
    expect((gj.features[0].geometry as { coordinates: number[] }).coordinates).toEqual([-75.0, -9.9]);
    expect((gj.features[0].properties as { originCode: string }).originCode).toBe("CONC-A");
    expect(gj.metadata.ruc).toBe("20512345678");
  });

  it("usa el polígono declarado cuando polygonJson es válido", () => {
    const geo: Record<string, OrigenGeo> = {
      "CONC-A": { originCode: "CONC-A", lat: -9.9, lng: -75.0, polygonJson: JSON.stringify({ type: "Polygon", coordinates: [[[-75, -9.9], [-74.9, -9.9], [-74.9, -9.8], [-75, -9.9]]] }) },
    };
    const gj = buildOriginsGeoJson([origins[0]], geo);
    expect(gj.features[0].geometry.type).toBe("Polygon");
  });

  it("polygonJson corrupto cae al punto sin romper", () => {
    const geo: Record<string, OrigenGeo> = {
      "CONC-A": { originCode: "CONC-A", lat: -9.9, lng: -75.0, polygonJson: "{no es json" },
    };
    const gj = buildOriginsGeoJson([origins[0]], geo);
    expect(gj.features[0].geometry.type).toBe("Point");
  });
});

describe("buildEudrMapFigure (figura del DDS)", () => {
  it("con un polígono → HTML con satélite Esri + overlay SVG", () => {
    const html = buildEudrMapFigure({
      polygons: [{ code: "P1", ring: [[-9.905, -75.005], [-9.905, -74.995], [-9.895, -74.995], [-9.895, -75.005]] }],
    });
    expect(html).toContain("eudr-map");
    expect(html).toContain("<polygon");
    expect(html).toContain("World_Imagery");
    expect(html).toContain("bbox=");
    expect(html).toContain("imageSR=4326");
  });
  it("con puntos → círculos en el overlay", () => {
    const html = buildEudrMapFigure({ points: [{ lat: -9.9, lng: -75.0, label: "O1" }] });
    expect(html).toContain("<circle");
    expect(html).toContain("O1");
  });
  it("sin geometría → string vacío (el reporte omite la figura)", () => {
    expect(buildEudrMapFigure({})).toBe("");
    expect(buildEudrMapFigure({ polygons: [{ ring: [[-9.9, -75.0]] }] })).toBe(""); // <3 vértices
  });
  it("eudrSignatureBlock escapa y arma dos columnas", () => {
    const s = eudrSignatureBlock("Titular <SAC>", "Sello ARFFS");
    expect(s).toContain("eudr-firma");
    expect(s).toContain("&lt;SAC&gt;");
    expect(s).toContain("Sello ARFFS");
  });
});
