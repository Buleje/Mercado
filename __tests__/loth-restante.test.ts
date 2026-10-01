/**
 * Tests — lo que queda del árbol (28-09): censo − talado en la tala, talado −
 * Σ trozas en el trozado, y el pt aserrable al 56 % al lado de cada m³.
 * Números del árbol 85-TOR del tenant de QA: tala 5.003 m³, trozas A-D
 * 1.471 + 1.290 + 0.995 + 1.131 = 4.887 m³.
 */

import { describe, it, expect } from "vitest";
import {
  lineasDelArbol,
  ptAserrableDeRolliza,
  restanteDeEspecie,
  restanteDelArbol,
  restanteTrozado,
  siguienteCodigoDeTroza,
  type LineaDelLibro,
} from "@/lib/forestal/loth-restante";
import { prepararArboles, type ArbolCensoTala, type UsoArbolCenso } from "@/lib/forestal/loth-censo-uso";

const L = (x: Partial<LineaDelLibro> & Pick<LineaDelLibro, "section" | "lineNo">): LineaDelLibro => ({
  entryDate: "2026-05-28T00:00:00.000Z",
  treeCode: null,
  trozaCode: null,
  status: "registrado",
  ...x,
});

const LIBRO_85: LineaDelLibro[] = [
  L({ section: "tala", lineNo: 1, treeCode: "85-TOR", volumeM3: "5.0030", diamMayorM: "0.800", diamMenorM: "0.600", lengthM: "13.00", motosierrista: "Juan Pérez", horaTala: "09:30", gpsOrigen: "censo" }),
  L({ section: "trozado", lineNo: 1, treeCode: "85-TOR", trozaCode: "85-TOR-A", volumeM3: "1.4710" }),
  L({ section: "trozado", lineNo: 2, treeCode: "85-TOR", trozaCode: "85-TOR-B", volumeM3: "1.2900" }),
  L({ section: "trozado", lineNo: 3, treeCode: "85-TOR", trozaCode: "85-TOR-C", volumeM3: "0.9950" }),
  L({ section: "trozado", lineNo: 4, treeCode: null, trozaCode: "85-TOR-D", volumeM3: "1.1310" }),
  // Ruido que trae el «contiene» del GET:
  L({ section: "tala", lineNo: 2, treeCode: "185-TOR", volumeM3: "7" }),
  L({ section: "trozado", lineNo: 5, treeCode: "185-TOR", trozaCode: "185-TOR-A", volumeM3: "2" }),
  L({ section: "despacho_troza", lineNo: 1, trozaCode: "85-TOR-A" }),
  L({ section: "trozado", lineNo: 6, treeCode: "85-TOR", trozaCode: "85-TOR-X", volumeM3: "9", status: "anulado" }),
];

describe("ptAserrableDeRolliza · la referencia al 56 %", () => {
  it("10 m³ en troza ≈ 2 374 pt (10 × 0.56 × 424), no 4 240", () => {
    expect(ptAserrableDeRolliza(10)).toBe(2374);
  });
  it("lo que se pasa también se lee en pt (negativo)", () => {
    expect(ptAserrableDeRolliza(-0.756)).toBe(-180);
  });
});

describe("lineasDelArbol", () => {
  it("toma la tala y las trozas del árbol exacto, sin el 185-TOR ni lo anulado", () => {
    const a = lineasDelArbol(LIBRO_85, "85-TOR");
    expect(a.tala).toMatchObject({ lineNo: 1, fecha: "2026-05-28", volumeM3: 5.003, diamMayorM: 0.8, lengthM: 13, motosierrista: "Juan Pérez", horaTala: "09:30", gpsOrigen: "censo" });
    expect(a.trozas.map((t) => t.trozaCode)).toEqual(["85-TOR-A", "85-TOR-B", "85-TOR-C", "85-TOR-D"]);
  });
  it("sin tala en el libro lo dice (null), no inventa una", () => {
    expect(lineasDelArbol(LIBRO_85, "999").tala).toBeNull();
  });
});

describe("restanteTrozado · lo talado − Σ trozas", () => {
  const arbol = lineasDelArbol(LIBRO_85, "85-TOR");

  it("sin la troza en curso: 5.003 − 4.887 = 0.116", () => {
    const r = restanteTrozado(arbol, null);
    expect(r.trozadoM3).toBe(4.887);
    expect(r.restanteM3).toBe(0.116);
    expect(r.trozas).toBe(4);
    expect(r.excede).toBe(false);
  });

  it("con la que se mide: 0.116 − 0.100 = 0.016 y cuenta 5 trozas", () => {
    const r = restanteTrozado(arbol, { trozaCode: "85-TOR-E", volumeM3: 0.1 });
    expect(r.restanteM3).toBe(0.016);
    expect(r.trozas).toBe(5);
    expect(r.excede).toBe(false);
  });

  it("pasarse de lo talado se marca (lo que T4 rechaza)", () => {
    const r = restanteTrozado(arbol, { trozaCode: "85-TOR-E", volumeM3: 0.2 });
    expect(r.restanteM3).toBe(-0.084);
    expect(r.excede).toBe(true);
  });

  it("justo lo talado NO es pasarse (T4 compara con ≤)", () => {
    expect(restanteTrozado(arbol, { trozaCode: "85-TOR-E", volumeM3: 0.116 }).excede).toBe(false);
  });

  it("un código ya asentado se reconoce (T3)", () => {
    expect(restanteTrozado(arbol, { trozaCode: "85-TOR-B", volumeM3: null }).repetida?.lineNo).toBe(2);
  });

  it("una tala sin volumen: no hay contra qué restar", () => {
    const sinVol = lineasDelArbol([L({ section: "tala", lineNo: 1, treeCode: "7", volumeM3: null })], "7");
    const r = restanteTrozado(sinVol, { trozaCode: "7-A", volumeM3: 1 });
    expect(r.restanteM3).toBeNull();
    expect(r.excede).toBe(false);
  });
});

describe("siguienteCodigoDeTroza", () => {
  const arbol = lineasDelArbol(LIBRO_85, "85-TOR");
  it("A-D asentadas → E", () => expect(siguienteCodigoDeTroza("85-TOR", arbol.trozas)).toBe("85-TOR-E"));
  it("sin trozas → A", () => expect(siguienteCodigoDeTroza("111", [])).toBe("111-A"));
  it("un hueco se llena primero", () => {
    expect(siguienteCodigoDeTroza("9", [{ id: "x", lineNo: 1, trozaCode: "9-B", volumeM3: 1 }])).toBe("9-A");
  });
  it("trozado con números sigue con números", () => {
    expect(siguienteCodigoDeTroza("111", [{ id: "a", lineNo: 1, trozaCode: "111-1", volumeM3: 1 }, { id: "b", lineNo: 2, trozaCode: "111-2", volumeM3: 1 }])).toBe("111-3");
  });
});

describe("tala · censo − talado", () => {
  it("del árbol: 4.247 − 5.003 = −0.756 (se midió más de lo estimado)", () => {
    expect(restanteDelArbol(4.2474, 5.003).restanteM3).toBe(-0.7556);
  });
  it("sin medir no hay restante", () => {
    expect(restanteDelArbol(4.2474, null).restanteM3).toBeNull();
  });

  const censo: ArbolCensoTala[] = [
    { id: "a", treeCode: "85-TOR", speciesCommon: "Tornillo", speciesScientific: null, speciesNative: null, cites: false, dapM: 0.8, hcM: 13, volM3: 4.2474, utmZona: null, utmX: null, utmY: null, condicion: null, notes: null, estadoCenso: "en_pie" },
    { id: "b", treeCode: "86-TOR", speciesCommon: "Tornillo", speciesScientific: null, speciesNative: null, cites: false, dapM: 0.9, hcM: 14, volM3: 6, utmZona: null, utmX: null, utmY: null, condicion: null, notes: null, estadoCenso: "en_pie" },
    { id: "c", treeCode: "87-TOR", speciesCommon: "Tornillo", speciesScientific: null, speciesNative: null, cites: false, dapM: 0.7, hcM: 10, volM3: 3, utmZona: null, utmX: null, utmY: null, condicion: null, notes: null, estadoCenso: "en_pie" },
    { id: "d", treeCode: "10-CAP", speciesCommon: "Capirona", speciesScientific: null, speciesNative: null, cites: false, dapM: 0.6, hcM: 9, volM3: 2, utmZona: null, utmX: null, utmY: null, condicion: null, notes: null, estadoCenso: "en_pie" },
  ];
  const usos: UsoArbolCenso[] = [
    { treeCode: "85-TOR", tala: { lineNo: 1, fecha: "2026-05-28", volumeM3: 5.003 }, trozas: 4, trozasM3: 4.887, despachadas: 2, consumidas: 0 },
    { treeCode: "87-TOR", tala: { lineNo: 2, fecha: "2026-05-29", volumeM3: null }, trozas: 0, trozasM3: 0, despachadas: 0, consumidas: 0 },
  ];
  const arboles = prepararArboles(censo, usos);

  it("de la especie: 13.247 censado − 5.003 del libro − 5.5 de éste = 2.744", () => {
    const e = restanteDeEspecie(arboles, "Tornillo", "86-TOR", 5.5);
    expect(e).toMatchObject({ especie: "Tornillo", arboles: 3, talados: 3, censadoM3: 13.2474, taladoM3: 10.503, restanteM3: 2.7444, talasSinVolumen: 1 });
  });
  it("sin medir éste, sólo lo del libro", () => {
    expect(restanteDeEspecie(arboles, "tornillo", "86-TOR", null)).toMatchObject({ talados: 2, taladoM3: 5.003 });
  });
  it("otra especie, otra cuenta", () => {
    expect(restanteDeEspecie(arboles, "Capirona", "10-CAP", null)).toMatchObject({ arboles: 1, censadoM3: 2, taladoM3: 0, restanteM3: 2 });
  });
});
