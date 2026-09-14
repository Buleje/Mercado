/**
 * __tests__/rrhh-documento.test.ts
 *
 * ADR-414 §1 — el documento se normaliza igual que el cruce con Adelantos
 * (`lib/adelantos/cuenta-unificada.ts`): sólo letras y dígitos, sin mirar
 * mayúsculas ni separadores. Un DNI mal tipeado no puede crear una persona
 * dos veces, y un documento vacío nunca une nada.
 */
import { describe, expect, it } from "vitest";
import { enmascararDocumento, esDniValido, mismoDocumento, normalizarDocumento } from "@/lib/rrhh/documento";

describe("normalizarDocumento", () => {
  it("saca separadores y pasa a mayúsculas", () => {
    expect(normalizarDocumento("12.345.678")).toBe("12345678");
    expect(normalizarDocumento("ab-12-cd")).toBe("AB12CD");
  });
  it("vacío o sólo separadores → null (no une nada)", () => {
    expect(normalizarDocumento("")).toBeNull();
    expect(normalizarDocumento("   ")).toBeNull();
    expect(normalizarDocumento("---")).toBeNull();
    expect(normalizarDocumento(null)).toBeNull();
    expect(normalizarDocumento(undefined)).toBeNull();
  });
});

describe("mismoDocumento", () => {
  it("mismo documento con distinto formato y mayúsculas → true", () => {
    expect(mismoDocumento("12.345.678", "12345678")).toBe(true);
    expect(mismoDocumento("ab-12-cd", "AB12CD")).toBe(true);
  });
  it("CONTROL NEGATIVO: documentos distintos → false", () => {
    expect(mismoDocumento("12345678", "12345679")).toBe(false);
  });
  it("ninguno de los dos vacío puede darse como iguales", () => {
    expect(mismoDocumento(null, null)).toBe(false);
    expect(mismoDocumento("", "")).toBe(false);
  });
});

describe("enmascararDocumento", () => {
  it("deja sólo los últimos 4 caracteres visibles", () => {
    expect(enmascararDocumento("12345678")).toBe("•••• 5678");
  });
  it("documento corto (≤4): se muestra entero detrás de los puntos", () => {
    expect(enmascararDocumento("123")).toBe("•••• 123");
  });
  it("sin documento → null", () => {
    expect(enmascararDocumento(null)).toBeNull();
    expect(enmascararDocumento("")).toBeNull();
  });
});

describe("esDniValido", () => {
  it("8 dígitos exactos → true", () => {
    expect(esDniValido("12345678")).toBe(true);
  });
  it("CONTROL NEGATIVO: 7 u 9 dígitos, o con letras → false", () => {
    expect(esDniValido("1234567")).toBe(false);
    expect(esDniValido("123456789")).toBe(false);
    expect(esDniValido("1234567A")).toBe(false);
  });
});
