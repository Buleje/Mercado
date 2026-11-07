import { describe, expect, it } from "vitest";
import { esCopiaDePrueba, tonoDelNegocio } from "@/lib/admin/copia-de-prueba";

/* Las 5 filas reales de Tenant (medidas 04-11) + bordes. */
const FILAS = [
  { slug: "inversiones-agroforestales-blas-sociedad-anonima", name: "Inversiones Agroforestales BLAS sac", prueba: false },
  { slug: "inversiones-agroforestales-blas-sociedad-op-qa-ui", name: "Inversiones Agroforestales BLAS sac · QA UI", prueba: true },
  { slug: "inversiones-agroforestales-blas-sociedad-op-prueba-qa", name: "Inversiones Agroforestales BLAS sac · Prueba QA", prueba: true },
  { slug: "inversiones-agroforestales-blas-sociedad-op-prueba-qa-2", name: "Inversiones Agroforestales BLAS sac · Prueba QA 2", prueba: true },
  { slug: "main", name: "Buleje", prueba: false },
];

describe("esCopiaDePrueba", () => {
  it.each(FILAS)("$slug → $prueba", ({ slug, name, prueba }) => {
    expect(esCopiaDePrueba({ slug, name })).toBe(prueba);
  });

  it("basta con que lo diga el slug o el nombre", () => {
    expect(esCopiaDePrueba({ slug: "bodega-demo", name: "Bodega Sol" })).toBe(true);
    expect(esCopiaDePrueba({ slug: "bodega-sol", name: "Bodega Sol (test)" })).toBe(true);
    expect(esCopiaDePrueba({ slug: "bodega-sol", name: null })).toBe(false);
  });

  it("palabra completa: «testa», «quasar» y «demostración» NO son prueba", () => {
    expect(esCopiaDePrueba({ slug: "testa-maderas", name: "Testa Maderas" })).toBe(false);
    expect(esCopiaDePrueba({ slug: "quasar", name: "Quasar SAC" })).toBe(false);
    expect(esCopiaDePrueba({ slug: "ferreteria-1", name: "Demostración de Pucallpa" })).toBe(false);
    expect(esCopiaDePrueba({ slug: "capital-qatar", name: "Qatar Import" })).toBe(false);
  });

  it("mayúsculas, tildes y plurales cuentan como la misma palabra", () => {
    expect(esCopiaDePrueba({ slug: "x", name: "PRUEBA" })).toBe(true);
    expect(esCopiaDePrueba({ slug: "x", name: "Copia de Pruebas" })).toBe(true);
    expect(esCopiaDePrueba({ slug: "x", name: "Prüeba" })).toBe(true);
  });

  it("sin datos no revienta y no marca nada", () => {
    expect(esCopiaDePrueba({})).toBe(false);
    expect(esCopiaDePrueba({ slug: null, name: undefined })).toBe(false);
    expect(esCopiaDePrueba({ slug: "", name: "" })).toBe(false);
  });
});

describe("tonoDelNegocio", () => {
  it("la copia de prueba gana aunque tenga lo forestal prendido (las 4 de Blas lo tienen)", () => {
    expect(tonoDelNegocio({ slug: "inversiones-agroforestales-blas-sociedad-op-qa-ui", name: "… · QA UI", forestal: true })).toBe("prueba");
  });

  it("negocio real: forestal → forestal; el resto → general", () => {
    expect(tonoDelNegocio({ slug: "inversiones-agroforestales-blas-sociedad-anonima", name: "Inversiones Agroforestales BLAS sac", forestal: true })).toBe("forestal");
    expect(tonoDelNegocio({ slug: "farmacia-sol", name: "Farmacia Sol", forestal: false })).toBe("general");
  });
});
