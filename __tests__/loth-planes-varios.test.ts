/** «Varios» del Plan de manejo: los 4 planes vivos de Blas (15-10-2026), clasificados. */
import { describe, expect, it } from "vitest";
import { clasificarPlanes } from "@/lib/forestal/loth-planes-varios";

const HOY = new Date("2026-10-15T15:00:00Z");
const PLANES = [
  { id: "po", planType: "PO", planNumber: "PO-2026-001", titularName: "Maderera Amazonica SAC", estado: "vigente", vigenciaDesde: "2026-03-20T00:00:00.000Z", vigenciaHasta: "2028-03-20T00:00:00.000Z" },
  { id: "sl96", planType: "PLANTACION", planNumber: "19-SEC/REG-PLT-2025-096", titularName: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI", estado: "vigente" },
  { id: "sr", planType: "PLANTACION", planNumber: "PO1", titularName: "COMUNIDAD SANTA ROSA DE CHIVIS", estado: "vigente", vigenciaDesde: "2026-07-01T00:00:00.000Z", vigenciaHasta: "2026-11-02T00:00:00.000Z" },
  { id: "sl167", planType: "PLANTACION", planNumber: "19-SEC/REG-PLT-2025-167", titularName: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI", estado: "vigente" },
];
const resumen = (modo: Parameters<typeof clasificarPlanes>[1]) =>
  clasificarPlanes(PLANES, modo, HOY).map((g) => [g.titulo, g.planes.map((p) => p.plan.id)]);

describe("clasificarPlanes", () => {
  it("por vigencia: lo que apura arriba, sin fecha al final", () => {
    expect(resumen("estado")).toEqual([
      ["Por vencer", ["sr"]],
      ["Vigentes", ["po"]],
      ["Sin vigencia cargada", ["sl96", "sl167"]],
    ]);
  });

  it("por tipo: en el orden del catálogo, con la sigla como la dice la norma", () => {
    expect(resumen("tipo")).toEqual([
      ["Plan Operativo", ["po"]],
      ["Registro de plantación forestal", ["sr", "sl96", "sl167"]],
    ]);
    const sr = clasificarPlanes(PLANES, "tipo", HOY)[1].planes[0];
    expect(sr.nombre).toBe("Plantación PO1");
    expect(sr.esPlantacion).toBe(true);
  });

  it("por titular: la misma comunidad junta, el que vence antes primero", () => {
    expect(resumen("titular")).toEqual([
      ["COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI", ["sl96", "sl167"]],
      ["COMUNIDAD SANTA ROSA DE CHIVIS", ["sr"]],
      ["Maderera Amazonica SAC", ["po"]],
    ]);
  });

  it("un registro de plantación cargado con otro tipo se reconoce por el código REG-PLT", () => {
    const [g] = clasificarPlanes([{ id: "x", planType: "PO", planNumber: "19-SEC/REG-PLT-2025-200", titularName: "X" }], "tipo", HOY);
    expect(g.titulo).toBe("Registro de plantación forestal");
  });
});
