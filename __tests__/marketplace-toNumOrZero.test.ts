/**
 * M7 — marketplace-toNumOrZero.test.ts
 *
 * Tests de toNumOrZero (lib/decimal-utils.ts).
 * Cubre edge cases incluyendo objetos Decimal-like (Prisma.Decimal shape).
 */

import { describe, it, expect } from "vitest";
import { toNumOrZero } from "@/lib/decimal-utils";

describe("toNumOrZero — decimal-utils", () => {
  it("number 12.5 → 12.5", () => {
    expect(toNumOrZero(12.5)).toBe(12.5);
  });

  it("null → 0", () => {
    expect(toNumOrZero(null)).toBe(0);
  });

  it("undefined → 0", () => {
    expect(toNumOrZero(undefined)).toBe(0);
  });

  it('string "19.99" → 19.99', () => {
    expect(toNumOrZero("19.99")).toBe(19.99);
  });

  it('string "abc" (no numérico) → 0', () => {
    expect(toNumOrZero("abc")).toBe(0);
  });

  it("objeto Decimal-like con toNumber() retorna el valor correcto", () => {
    const decimalLike = {
      toNumber: () => 12.5,
      toFixed: (d?: number) => (12.5).toFixed(d),
      toString: () => "12.5",
    };
    expect(toNumOrZero(decimalLike)).toBe(12.5);
  });

  it("número 0 → 0", () => {
    expect(toNumOrZero(0)).toBe(0);
  });

  it("número negativo -5.5 → -5.5 (valores válidos pasan)", () => {
    expect(toNumOrZero(-5.5)).toBe(-5.5);
  });

  it("Decimal-like con toNumber() === 0 → 0", () => {
    const zeroDec = {
      toNumber: () => 0,
      toFixed: () => "0.00",
      toString: () => "0",
    };
    expect(toNumOrZero(zeroDec)).toBe(0);
  });
});
