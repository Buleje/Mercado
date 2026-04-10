/**
 * Eval: Credit history tracking.
 * Contract test: CreditProfile tracks paidOnTime, paidLate, defaulted counters.
 * Business rule: these counters feed back into the scoring engine weights.
 */
import { describe, it, expect } from "vitest";

type CreditHistory = {
  paidOnTime: number;
  paidLate: number;
  defaulted: number;
};

function calculatePunctualityRate(h: CreditHistory): number {
  const total = h.paidOnTime + h.paidLate + h.defaulted;
  if (total === 0) return 0;
  return +(h.paidOnTime / total).toFixed(4);
}

function isEligibleForCreditIncrease(h: CreditHistory): boolean {
  const total = h.paidOnTime + h.paidLate + h.defaulted;
  if (total < 3) return false;
  if (h.defaulted > 0) return false;
  return calculatePunctualityRate(h) >= 0.8;
}

describe("Fiado > Credit History Tracking", () => {
  it("should calculate 100% punctuality for all on-time", () => {
    const rate = calculatePunctualityRate({ paidOnTime: 5, paidLate: 0, defaulted: 0 });
    expect(rate).toBe(1);
  });

  it("should calculate 50% punctuality for mixed record", () => {
    const rate = calculatePunctualityRate({ paidOnTime: 3, paidLate: 3, defaulted: 0 });
    expect(rate).toBe(0.5);
  });

  it("should return 0 for empty history", () => {
    const rate = calculatePunctualityRate({ paidOnTime: 0, paidLate: 0, defaulted: 0 });
    expect(rate).toBe(0);
  });

  it("should allow credit increase for good history", () => {
    expect(isEligibleForCreditIncrease({ paidOnTime: 5, paidLate: 1, defaulted: 0 })).toBe(true);
  });

  it("should deny credit increase with defaults", () => {
    expect(isEligibleForCreditIncrease({ paidOnTime: 10, paidLate: 0, defaulted: 1 })).toBe(false);
  });

  it("should deny credit increase with insufficient history", () => {
    expect(isEligibleForCreditIncrease({ paidOnTime: 2, paidLate: 0, defaulted: 0 })).toBe(false);
  });
});
