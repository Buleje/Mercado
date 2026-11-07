import { describe, expect, it } from "vitest";
import { avisoDeSunat, normalizarNumero, tipoDeDocumento, type DocumentoEncontrado } from "@/lib/documento/tipos";

const hallado = (p: Partial<DocumentoEncontrado>): DocumentoEncontrado => ({
  encontrado: true,
  tipo: "RUC",
  numero: "20123456789",
  nombre: "Empresa SAC",
  fuente: "SUNAT",
  ...p,
});

describe("normalizarNumero", () => {
  it("se queda sólo con los dígitos: la gente escribe con puntos y espacios", () => {
    expect(normalizarNumero("12.345.678")).toBe("12345678");
    expect(normalizarNumero("20 601 030 013")).toBe("20601030013");
    expect(normalizarNumero("DNI 12345678")).toBe("12345678");
  });

  it("no explota con vacío ni con null", () => {
    expect(normalizarNumero("")).toBe("");
    expect(normalizarNumero(null as unknown as string)).toBe("");
  });
});

describe("tipoDeDocumento", () => {
  it("ocho dígitos son un DNI", () => {
    expect(tipoDeDocumento("12345678")).toBe("DNI");
    expect(tipoDeDocumento("12.345.678")).toBe("DNI");
  });

  it("once dígitos con prefijo válido son un RUC", () => {
    for (const p of ["10", "15", "16", "17", "20"]) {
      expect(tipoDeDocumento(`${p}123456789`)).toBe("RUC");
    }
  });

  it("once dígitos con prefijo inválido NO son un RUC", () => {
    // Evita salir a SUNAT por un teléfono tipeado en el campo equivocado.
    expect(tipoDeDocumento("99123456789")).toBeNull();
  });

  it("un largo intermedio es null, no un error: es alguien a mitad de tipear", () => {
    expect(tipoDeDocumento("1234567")).toBeNull();
    expect(tipoDeDocumento("123456789")).toBeNull();
    expect(tipoDeDocumento("")).toBeNull();
  });
});

describe("avisoDeSunat", () => {
  it("avisa el NO HABIDO: su factura no sería deducible", () => {
    expect(avisoDeSunat(hallado({ condicion: "NO HABIDO", estado: "ACTIVO" }))).toMatch(/no sería deducible/);
  });

  it("avisa el RUC dado de baja", () => {
    expect(avisoDeSunat(hallado({ condicion: "HABIDO", estado: "BAJA DE OFICIO" }))).toMatch(/BAJA DE OFICIO/);
  });

  it("un RUC activo y habido no genera ruido", () => {
    expect(avisoDeSunat(hallado({ condicion: "HABIDO", estado: "ACTIVO" }))).toBeNull();
  });

  it("no compara mayúsculas: «Habido» es habido", () => {
    expect(avisoDeSunat(hallado({ condicion: "Habido", estado: "Activo" }))).toBeNull();
  });

  it("un DNI no tiene estado SUNAT que avisar", () => {
    expect(avisoDeSunat(hallado({ tipo: "DNI", condicion: undefined, estado: undefined }))).toBeNull();
  });

  it("sin datos de SUNAT no inventa una alarma", () => {
    expect(avisoDeSunat(hallado({ condicion: undefined, estado: undefined }))).toBeNull();
  });
});
