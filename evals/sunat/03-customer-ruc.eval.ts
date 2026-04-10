/**
 * Eval: RUC/DNI validation.
 * Uses the real validateRUC and validateDNI from lib/sunat.ts.
 * Business rule: RUC = 11 digits starting with 10 or 20. DNI = 8 digits.
 */
import { describe, it, expect } from "vitest";
import { validateRUC, validateDNI } from "@/lib/sunat";

describe("SUNAT > Customer RUC/DNI Validation", () => {
  it("should accept valid RUC starting with 10 (persona natural)", () => {
    expect(validateRUC("10456789012")).toBe(true);
  });

  it("should accept valid RUC starting with 20 (empresa)", () => {
    expect(validateRUC("20123456789")).toBe(true);
  });

  it("should reject RUC with wrong prefix (30)", () => {
    expect(validateRUC("30123456789")).toBe(false);
  });

  it("should reject RUC with less than 11 digits", () => {
    expect(validateRUC("1012345678")).toBe(false);
  });

  it("should reject RUC with letters", () => {
    expect(validateRUC("10ABCDEFGHI")).toBe(false);
  });

  it("should accept valid 8-digit DNI", () => {
    expect(validateDNI("70123456")).toBe(true);
    expect(validateDNI("00000001")).toBe(true);
  });

  it("should reject DNI with 7 digits", () => {
    expect(validateDNI("7012345")).toBe(false);
  });

  it("should reject DNI with 9 digits", () => {
    expect(validateDNI("701234567")).toBe(false);
  });

  it("should reject DNI with letters", () => {
    expect(validateDNI("7012345A")).toBe(false);
  });
});
