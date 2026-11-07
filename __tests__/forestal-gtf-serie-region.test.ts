import { describe, expect, it } from "vitest";
import {
  codigoRegionGtf,
  departamentoDeCodigo,
  regionDeNumero,
  serieDeCodigo,
  serieDeRegion,
  ubigeoDelPadron,
} from "@/lib/forestal/gtf-serie-region";

/**
 * La serie del talonario sale del departamento (SERFOR: «los dos primeros
 * dígitos corresponden al código de ubigeo departamental»). Números reales de
 * la base (29-09-2026): 019-001-0000003/4 (Pasco), 010-001-0000005 (Huánuco).
 */
describe("codigoRegionGtf — el ubigeo del departamento a 3 dígitos", () => {
  it("Pasco 019, Huánuco 010, Ucayali 025, sin importar tildes ni mayúsculas", () => {
    expect(codigoRegionGtf("Pasco")).toBe("019");
    expect(codigoRegionGtf("PASCO")).toBe("019");
    expect(codigoRegionGtf(" pasco ")).toBe("019");
    expect(codigoRegionGtf("Huánuco")).toBe("010");
    expect(codigoRegionGtf("HUANUCO")).toBe("010");
    expect(codigoRegionGtf("Ucayali")).toBe("025");
    expect(codigoRegionGtf("Lima")).toBe("015");
  });

  it("lo que no es un departamento no tiene serie (no se inventa)", () => {
    expect(codigoRegionGtf("Constitucion")).toBeNull();
    expect(codigoRegionGtf("Selva Central")).toBeNull();
    expect(codigoRegionGtf("")).toBeNull();
    expect(codigoRegionGtf(null)).toBeNull();
  });

  it("de vuelta: el código dice el departamento", () => {
    expect(departamentoDeCodigo("010")).toBe("Huanuco");
    expect(departamentoDeCodigo("19")).toBe("Pasco");
    expect(departamentoDeCodigo("999")).toBeNull();
  });
});

describe("regionDeNumero — sólo los N° con la forma de SERFOR", () => {
  it("tres tramos numéricos: la región es el primero, por su valor", () => {
    expect(regionDeNumero("019-001-0000003")).toBe("019");
    expect(regionDeNumero("19-001-65")).toBe("019");
    expect(regionDeNumero(" 010 - 001 - 0000005 ")).toBe("010");
  });

  it("otra forma no dice región", () => {
    expect(regionDeNumero("001-0000127")).toBeNull();
    expect(regionDeNumero("TEST-GTF-9001")).toBeNull();
    expect(regionDeNumero("123-001-5")).toBeNull();
    expect(regionDeNumero("")).toBeNull();
  });
});

describe("serieDeRegion — el segundo tramo sale del sistema", () => {
  it("el más usado en la región; sin ninguno, 001", () => {
    expect(serieDeCodigo("019", ["019-002-0000001", "019-001-0000003", "19-001-13", "010-003-0000005"])).toBe("019-001");
    expect(serieDeCodigo("019", ["010-003-0000005"])).toBe("019-001");
    expect(serieDeCodigo("010", ["010-003-0000005"])).toBe("010-003");
    expect(serieDeRegion("Pasco", [])).toBe("019-001");
    expect(serieDeRegion("PASCO", ["019-001-0000004"])).toBe("019-001");
  });

  it("departamento desconocido: sin serie", () => {
    expect(serieDeRegion("Selva Central", ["019-001-0000003"])).toBeNull();
  });
});

describe("ubigeoDelPadron — los nombres del INEI y el departamento que el padrón deduce", () => {
  it("lo escrito en mayúsculas sale con el nombre oficial", () => {
    expect(ubigeoDelPadron({ departamento: "PASCO", provincia: "OXAPAMPA", distrito: "PUERTO BERMUDEZ" })).toEqual({
      departamento: "Pasco",
      provincia: "Oxapampa",
      distrito: "Puerto Bermúdez",
      codigo: "19",
      deducidoDe: null,
    });
  });

  it("el plan de Blas dice «Constitucion» como región: es un distrito de Oxapampa, Pasco (único en el Perú)", () => {
    expect(ubigeoDelPadron({ departamento: "Constitucion" })).toEqual({
      departamento: "Pasco",
      provincia: "Oxapampa",
      distrito: "Constitución",
      codigo: "19",
      deducidoDe: "distrito",
    });
  });

  it("una provincia en lugar del departamento: la provincia manda (Oxapampa es provincia y distrito)", () => {
    expect(ubigeoDelPadron({ departamento: "Oxapampa", distrito: "Constitución" })).toMatchObject({
      departamento: "Pasco",
      provincia: "Oxapampa",
      distrito: "Constitución",
      deducidoDe: "provincia",
    });
  });

  it("provincia en un departamento y distrito en otro: no se elige ninguno, salvo que la provincia escrita desempate", () => {
    // Huancabamba = provincia de Piura (020) y distrito de Oxapampa, Pasco (019).
    expect(ubigeoDelPadron({ departamento: "Huancabamba" }).codigo).toBeNull();
    expect(ubigeoDelPadron({ departamento: "Huancabamba", provincia: "Oxapampa" })).toMatchObject({
      departamento: "Pasco",
      provincia: "Oxapampa",
      distrito: "Huancabamba",
      codigo: "19",
      deducidoDe: "distrito",
    });
    expect(ubigeoDelPadron({ departamento: "Leoncio Prado" }).codigo).toBeNull();
    expect(ubigeoDelPadron({ departamento: "Satipo" })).toMatchObject({ departamento: "Junín", deducidoDe: "provincia" });
  });

  it("lo que el padrón no conoce se devuelve tal cual (nunca se borra un dato declarado)", () => {
    expect(ubigeoDelPadron({ departamento: "Selva Central", provincia: "X" })).toEqual({
      departamento: "Selva Central",
      provincia: "X",
      distrito: "",
      codigo: null,
      deducidoDe: null,
    });
  });
});
