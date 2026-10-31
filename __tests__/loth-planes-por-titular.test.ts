/** El selector de planes agrupa por titular (los 4 planes de la captura de Brandon, 07-10). */
import { describe, expect, it } from "vitest";
import { agruparPlanesPorTitular, claveDeTitular } from "@/lib/forestal/loth-planes-por-titular";

const PLANES = [
  { id: "1", planNumber: "19-SEC/REG-PLT-2025-167", titularName: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI" },
  { id: "2", planNumber: "PO1", titularName: "COMUNIDAD SANTA ROSA DE CHIVIS" },
  { id: "3", planNumber: "19-SEC/REG-PLT-2025-096", titularName: "Comunidad Nativa San Luis de Chinchihuani " },
  { id: "4", planNumber: "PO-2026-001", titularName: "Maderera Amazonica SAC" },
];

describe("agruparPlanesPorTitular", () => {
  it("junta los dos registros de San Luis de Chinchihuani aunque estén escritos distinto", () => {
    const g = agruparPlanesPorTitular(PLANES);
    expect(g.map((x) => x.planes.map((p) => p.id))).toEqual([["1", "3"], ["2"], ["4"]]);
    expect(g[0].titular).toBe("COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI");
  });

  it("tildes, mayúsculas y espacios dobles no separan al mismo titular", () => {
    expect(claveDeTitular("Maderera  Amazónica SAC")).toBe(claveDeTitular("MADERERA AMAZONICA SAC"));
  });

  it("los planes sin titular van al final, en su propio grupo", () => {
    const g = agruparPlanesPorTitular([{ id: "x", titularName: "" }, ...PLANES]);
    expect(g.at(-1)).toMatchObject({ titular: "Sin titular", planes: [{ id: "x" }] });
  });
});
