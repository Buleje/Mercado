/**
 * Eval: IGV breakdown (base + tax = total).
 * Uses the real calculateIGV from lib/sunat.ts.
 * Business rule: Peru IGV is 18%. Prices include IGV. gravado = total / 1.18.
 */
import { describe, it, expect } from "vitest";
import { calculateIGV } from "@/lib/sunat";

describe("SUNAT > IGV Breakdown", () => {
  it("should break down S/100 correctly", () => {
    const igv = calculateIGV(100);
    expect(igv.gravado).toBeCloseTo(84.75, 2);
    expect(igv.igv).toBeCloseTo(15.25, 2);
    expect(igv.total).toBeCloseTo(100, 2);
  });

  it("should break down S/236 (double of 118)", () => {
    const igv = calculateIGV(236);
    expect(igv.gravado).toBe(200);
    expect(igv.igv).toBe(36);
    expect(igv.total).toBe(236);
  });

  it("should handle small amounts (S/1.18)", () => {
    const igv = calculateIGV(1.18);
    expect(igv.gravado).toBe(1);
    expect(igv.igv).toBeCloseTo(0.18, 2);
    expect(igv.total).toBeCloseTo(1.18, 2);
  });

  it("should satisfy gravado + igv == total", () => {
    const amounts = [15.5, 42.3, 118, 250.75, 999.99];
    for (const amount of amounts) {
      const igv = calculateIGV(amount);
      expect(igv.gravado + igv.igv).toBeCloseTo(igv.total, 2);
    }
  });

  it("should round to 2 decimal places", () => {
    const igv = calculateIGV(33.33);
    const gravadoDecimals = igv.gravado.toString().split(".")[1]?.length ?? 0;
    const igvDecimals = igv.igv.toString().split(".")[1]?.length ?? 0;
    expect(gravadoDecimals).toBeLessThanOrEqual(2);
    expect(igvDecimals).toBeLessThanOrEqual(2);
  });
});
