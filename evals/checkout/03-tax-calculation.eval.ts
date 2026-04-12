/**
 * Eval: IGV 18% tax calculation.
 * Uses the real calculateIGV from lib/sunat.ts.
 * Business rule: prices include IGV. gravado = total / 1.18, igv = total - gravado.
 */
import { describe, it, expect } from "vitest";
import { calculateIGV } from "@/lib/sunat";

describe("Checkout > IGV 18% Tax Calculation", () => {
  it("should break down S/118 into gravado=100, igv=18", () => {
    const result = calculateIGV(118);
    expect(result.gravado).toBe(100);
    expect(result.igv).toBe(18);
    expect(result.total).toBe(118);
  });

  it("should handle S/59 correctly", () => {
    const result = calculateIGV(59);
    expect(result.gravado).toBe(50);
    expect(result.igv).toBe(9);
    expect(result.total).toBe(59);
  });

  it("should handle S/0", () => {
    const result = calculateIGV(0);
    expect(result.gravado).toBe(0);
    expect(result.igv).toBe(0);
    expect(result.total).toBe(0);
  });

  it("should round to 2 decimals on odd amounts", () => {
    const result = calculateIGV(71.3);
    expect(result.gravado).toBeCloseTo(60.42, 2);
    expect(result.igv).toBeCloseTo(10.88, 2);
    expect(result.gravado + result.igv).toBeCloseTo(71.3, 2);
  });

  it("gravado + igv should always equal total", () => {
    for (const amount of [10, 25.5, 99.99, 150, 1000]) {
      const r = calculateIGV(amount);
      expect(r.gravado + r.igv).toBeCloseTo(r.total, 2);
    }
  });
});
