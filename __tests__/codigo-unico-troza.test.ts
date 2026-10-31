/**
 * ADR-477 — el código único de troza `<código en la guía>-<correlativo corto>`:
 * cómo se arma (correlativo, niveles 1-3) y cómo se parte de vuelta, sin
 * confundir códigos tipeados a mano que por casualidad terminan en números.
 */
import { describe, expect, it } from "vitest";
import { arbolDeTroza } from "@/lib/forestal/loth-censo-uso";
import {
  CODIGO_UNICO_MAX,
  candidatosCodigoUnico,
  codigoDeLaGuia,
  correlativoCorto,
  partirCodigoUnico,
} from "@/lib/forestal/codigo-unico-troza";

describe("correlativoCorto", () => {
  it("sin ceros a la izquierda, mínimo 4 dígitos, y crece", () => {
    expect(correlativoCorto("019-001-0000001")).toBe("0001");
    expect(correlativoCorto("001-0000120")).toBe("0120");
    expect(correlativoCorto("019-001-0090002")).toBe("90002");
    expect(correlativoCorto("025-001-9000459")).toBe("9000459");
    expect(correlativoCorto("TEST-GTF-9001")).toBe("9001");
    expect(correlativoCorto(" 019 - 001-0000064 ")).toBe("0064");
  });
  it("vacío → null; último tramo no numérico → tal cual", () => {
    expect(correlativoCorto("")).toBeNull();
    expect(correlativoCorto(null)).toBeNull();
    expect(correlativoCorto("001-ABC")).toBe("ABC");
  });
});

describe("candidatosCodigoUnico", () => {
  it("3 tramos → N1, N2, N3", () => {
    expect(candidatosCodigoUnico("12A", "019-001-0000001")).toEqual(["12A-0001", "12A-019/0001", "12A-019-001/0001"]);
  });
  it("2 tramos → N1, N2", () => {
    expect(candidatosCodigoUnico("85-TOR-A", "001-0000120")).toEqual(["85-TOR-A-0120", "85-TOR-A-001/0120"]);
  });
  it("serie no numérica: sólo N1 (lo que no se parte de vuelta no se propone)", () => {
    expect(candidatosCodigoUnico("12A", "TEST-GTF-9001")).toEqual(["12A-9001"]);
  });
  it("descarta los > 60; sin N° o sin código → []", () => {
    const largo = "X".repeat(CODIGO_UNICO_MAX - 5);
    expect(candidatosCodigoUnico(largo, "019-001-0000001")).toEqual([`${largo}-0001`]);
    expect(candidatosCodigoUnico("X".repeat(CODIGO_UNICO_MAX), "019-001-0000001")).toEqual([]);
    expect(candidatosCodigoUnico("12A", "")).toEqual([]);
    expect(candidatosCodigoUnico(" ", "019-001-0000001")).toEqual([]);
  });
});

describe("partirCodigoUnico / codigoDeLaGuia", () => {
  const ida = ["1", "12A", "12-A", "85-TOR-A", "13/A (0000008)", "QABK-THCTP-1-A", "100-2020"];
  const nums = ["019-001-0000001", "001-0000120", "019-001-0090002"];
  it("ida y vuelta: cada candidato devuelve el código de la guía (con y sin N°)", () => {
    for (const cod of ida) {
      for (const n of nums) {
        for (const c of candidatosCodigoUnico(cod, n)) {
          expect(partirCodigoUnico(c, n)?.codigoGuia).toBe(cod);
          expect(codigoDeLaGuia(c, n)).toBe(cod);
        }
      }
    }
    expect(partirCodigoUnico("12A-019/0001")).toEqual({ codigoGuia: "12A", serie: "019", correlativo: "0001", nivel: 2 });
    expect(partirCodigoUnico("12A-019-001/0001")).toMatchObject({ codigoGuia: "12A", nivel: 3 });
    expect(partirCodigoUnico("13/A (0000008)-0003")).toMatchObject({ codigoGuia: "13/A (0000008)", nivel: 1 });
  });
  it("negativos: códigos de siempre no se parten", () => {
    for (const c of ["85-TOR-A", "SC-1-10-047463-3", "001-BOL", "85-1", "186A", "12A (0000002)"]) {
      expect(partirCodigoUnico(c)).toBeNull();
      expect(codigoDeLaGuia(c)).toBe(c);
    }
  });
  it("con N° de guía sólo parte si el correlativo (y la serie) son los de ESA guía", () => {
    expect(partirCodigoUnico("100-2020", "019-001-0000001")).toBeNull();
    expect(partirCodigoUnico("12A-0002", "019-001-0000001")).toBeNull();
    expect(partirCodigoUnico("12A-020/0001", "019-001-0000001")).toBeNull();
    expect(partirCodigoUnico("12A-0001", "19-1-1")).toMatchObject({ codigoGuia: "12A" });
  });
});

describe("arbolDeTroza ignora el sufijo (invariante: x + sufijo ≡ x)", () => {
  it.each([
    ["1-0001", "1"],
    ["12-A-019/0001", "12"],
    ["12A-0001", "12A"],
    ["85-TOR-A-0120", "85-TOR"],
  ])("%s → %s", (code, arbol) => {
    expect(arbolDeTroza(code)).toBe(arbol);
    expect(arbolDeTroza(code)).toBe(arbolDeTroza(codigoDeLaGuia(code)));
  });
});
