/**
 * Dossier EUDR (ADR-140) — helpers puros de geo + evaluación de riesgo.
 * Lo que gatea "apto para la UE": el riesgo es negligible SOLO con traza + geo +
 * sin-deforestación completos.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeOrigenGeo,
  origenGeolocalizado,
  evaluarRiesgoEudr,
  type DdsPlot,
} from "@/lib/forestal/eudr-types";

const plot = (over: Partial<DdsPlot> = {}): DdsPlot => ({
  originCode: "CONC-1", originType: "concesion", region: "Ucayali",
  lat: -8.5, lng: -74.5, hasPolygon: false, pais: "PE",
  deforestationFree: true, gtfs: ["GTF-1"], especies: ["Tornillo"], cites: false, sinGeo: false,
  ...over,
});

describe("normalizeOrigenGeo", () => {
  it("clampea coordenadas fuera de rango a null", () => {
    const g = normalizeOrigenGeo({ originCode: "X", lat: 999, lng: -74.5 });
    expect(g.lat).toBeNull();
    expect(g.lng).toBeNull(); // si una es inválida, el par no geolocaliza
  });
  it("acepta coordenadas válidas y defaultea país PE", () => {
    const g = normalizeOrigenGeo({ originCode: "X", lat: -8.5, lng: -74.5 });
    expect(g.lat).toBe(-8.5);
    expect(g.lng).toBe(-74.5);
    expect(g.pais).toBe("PE");
    expect(g.deforestationFree).toBe(false);
  });
});

describe("origenGeolocalizado", () => {
  it("true con lat+lng", () => expect(origenGeolocalizado(normalizeOrigenGeo({ originCode: "X", lat: -8.5, lng: -74.5 }))).toBe(true));
  it("true con polígono", () => expect(origenGeolocalizado(normalizeOrigenGeo({ originCode: "X", polygonJson: '{"type":"Polygon"}' }))).toBe(true));
  it("false sin nada", () => expect(origenGeolocalizado(normalizeOrigenGeo({ originCode: "X" }))).toBe(false));
});

describe("evaluarRiesgoEudr", () => {
  it("negligible: traza + geo + sin-deforestación completos", () => {
    const r = evaluarRiesgoEudr([plot()], true);
    expect(r.riesgo).toBe("negligible");
    expect(r.gaps).toHaveLength(0);
    expect(r.geoCompleta).toBe(true);
    expect(r.deforestationFreeTotal).toBe(true);
  });
  it("no_negligible si un origen no está geolocalizado", () => {
    const r = evaluarRiesgoEudr([plot({ sinGeo: true, lat: null, lng: null })], true);
    expect(r.riesgo).toBe("no_negligible");
    expect(r.geoCompleta).toBe(false);
    expect(r.gaps.some((g) => /geolocaliz/i.test(g))).toBe(true);
  });
  it("no_negligible si la traza está incompleta", () => {
    const r = evaluarRiesgoEudr([plot()], false);
    expect(r.riesgo).toBe("no_negligible");
    expect(r.gaps.some((g) => /cadena|custodia/i.test(g))).toBe(true);
  });
  it("no_negligible si falta atestar sin-deforestación", () => {
    const r = evaluarRiesgoEudr([plot({ deforestationFree: false })], true);
    expect(r.riesgo).toBe("no_negligible");
    expect(r.deforestationFreeTotal).toBe(false);
    expect(r.gaps.some((g) => /deforestaci/i.test(g))).toBe(true);
  });
  it("no_negligible sin orígenes", () => {
    const r = evaluarRiesgoEudr([], true);
    expect(r.riesgo).toBe("no_negligible");
  });
});
