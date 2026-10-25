/**
 * Relleno en el plan de manejo (`loth-plan-relleno`): lo que se escribe para no
 * dejar el campo vacío. Casos reales de Blas (24-10-2026): la resolución
 * «ERERER» y el regente «-».
 */
import { describe, expect, it } from "vitest";
import { mensajeDeRelleno, motivoDeRelleno, rellenoEnPlan } from "@/lib/forestal/loth-plan-relleno";

describe("motivoDeRelleno", () => {
  it("los dos de Blas son relleno", () => {
    expect(motivoDeRelleno("ERERER", "numero")).toMatch(/cifra|repite/);
    expect(motivoDeRelleno("ERERER", "codigo")).toMatch(/repite «ER»/);
    expect(motivoDeRelleno("-", "nombre")).toMatch(/sólo signos/);
  });

  it("vacío NO es relleno: es un dato que falta", () => {
    expect(motivoDeRelleno("", "nombre")).toBeNull();
    expect(motivoDeRelleno("   ", "numero")).toBeNull();
    expect(motivoDeRelleno(null, "texto")).toBeNull();
    expect(motivoDeRelleno(undefined, "codigo")).toBeNull();
  });

  it.each([
    ["--", "texto"],
    ["?", "nombre"],
    ["xxx", "codigo"],
    ["x", "nombre"],
    ["aaaa", "texto"],
    ["asd", "nombre"],
    ["qwerty", "texto"],
    ["N/A", "nombre"],
    ["sin dato", "texto"],
    ["Pendiente", "nombre"],
    ["s/n", "numero"],
    ["S/N", "codigo"],
    ["000", "numero"],
    ["0-0", "codigo"],
    ["Juan", "numero"],
    ["asdasdasd", "texto"],
    // B2: el romano no abre la puerta al «sin número» ni al «xxx».
    ["S/N", "numero"],
    ["S/N", "codigo"],
    ["XXX", "codigo"],
    ["III", "numero"],
  ] as const)("«%s» (%s) es relleno", (valor, tipo) => {
    expect(motivoDeRelleno(valor, tipo)).not.toBeNull();
  });

  it.each([
    ["PO1", "codigo"],
    ["PO 12", "codigo"],
    ["Coco", "nombre"],
    ["Li", "nombre"],
    ["Sector 3", "texto"],
    ["RDF N° 001-2026-GRU", "numero"],
    ["19-SEC/REG-PLT-2025-096", "codigo"],
    ["COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI", "nombre"],
    ["20601234567", "numero"],
    ["Ucayali", "texto"],
    ["Ana", "nombre"],
    ["N° 105", "numero"],
    // B2: los números romanos son datos en un código o un texto.
    ["III", "codigo"],
    ["IV", "codigo"],
    ["XII", "codigo"],
    ["Parcela III", "codigo"],
    ["III", "texto"],
    ["VIII", "texto"],
  ] as const)("«%s» (%s) tiene forma de dato", (valor, tipo) => {
    expect(motivoDeRelleno(valor, tipo)).toBeNull();
  });

  it("el motivo dice qué hacer y corta el valor largo", () => {
    const m = motivoDeRelleno("-".repeat(40), "texto");
    expect(m).toContain("déjalo vacío");
    expect(m).toContain("…»");
  });
});

describe("rellenoEnPlan", () => {
  it("sólo juzga lo que viene (PATCH parcial) y en el orden del formulario", () => {
    const r = rellenoEnPlan({ regenteName: "-", resolucionNumber: "ERERER", titularName: "Comunidad Nativa Callería" });
    expect(r.map((x) => x.campo)).toEqual(["resolucionNumber", "regenteName"]);
    expect(r[0]?.etiqueta).toBe("Resolución");
  });

  it("ignora lo que no es texto y lo vacío", () => {
    expect(rellenoEnPlan({ planNumber: null, alias: "", sector: 3 as unknown as string })).toEqual([]);
  });
});

describe("mensajeDeRelleno", () => {
  it("una línea con el primero y cuántos más", () => {
    expect(mensajeDeRelleno([])).toBeNull();
    const r = rellenoEnPlan({ resolucionNumber: "ERERER", regenteName: "-", cuenca: "xxx" });
    expect(mensajeDeRelleno(r.slice(0, 1))).toMatch(/^Resolución: «ERERER»/);
    expect(mensajeDeRelleno(r.slice(0, 2))).toMatch(/\(y 1 campo más con relleno\)\.$/);
    expect(mensajeDeRelleno(r)).toMatch(/\(y 2 campos más con relleno\)\.$/);
  });
});
