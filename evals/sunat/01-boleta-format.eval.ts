/**
 * Eval: Boleta number format (B###-########).
 * Business rule: boleta series starts with B (e.g. B001), correlativo is 8 digits zero-padded.
 * Factura series starts with F (e.g. F001).
 */
import { describe, it, expect } from "vitest";

const BOLETA_REGEX = /^B\d{3}-\d{8}$/;
const FACTURA_REGEX = /^F\d{3}-\d{8}$/;

function formatNumeroCompleto(series: string, number: number): string {
  return `${series}-${String(number).padStart(8, "0")}`;
}

describe("SUNAT > Boleta Number Format", () => {
  it("should format boleta B001-00000001", () => {
    const result = formatNumeroCompleto("B001", 1);
    expect(result).toBe("B001-00000001");
    expect(result).toMatch(BOLETA_REGEX);
  });

  it("should format boleta B001-00001234", () => {
    const result = formatNumeroCompleto("B001", 1234);
    expect(result).toBe("B001-00001234");
    expect(result).toMatch(BOLETA_REGEX);
  });

  it("should format factura F001-00000099", () => {
    const result = formatNumeroCompleto("F001", 99);
    expect(result).toBe("F001-00000099");
    expect(result).toMatch(FACTURA_REGEX);
  });

  it("should reject invalid boleta format", () => {
    expect("X001-00000001").not.toMatch(BOLETA_REGEX);
    expect("B001-123").not.toMatch(BOLETA_REGEX);
    expect("B01-00000001").not.toMatch(BOLETA_REGEX);
  });

  it("should handle max correlativo (99999999)", () => {
    const result = formatNumeroCompleto("B001", 99999999);
    expect(result).toBe("B001-99999999");
    expect(result).toMatch(BOLETA_REGEX);
  });
});
