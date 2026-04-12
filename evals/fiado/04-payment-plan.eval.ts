/**
 * Eval: Payment plan generation.
 * Tests interest rate calculation based on INTEREST_RATES from installment-manager.ts.
 * Business rule: 2 cuotas = 0%, 3 cuotas = 3%, 4 cuotas = 5% monthly interest.
 */
import { describe, it, expect } from "vitest";
import { INTEREST_RATES, ALLOWED_INSTALLMENTS } from "@/lib/credit/installment-manager";

function calculatePlan(principal: number, installments: number) {
  const rate = INTEREST_RATES[installments] ?? 0.05;
  let totalWithInterest: number;
  if (rate === 0) {
    totalWithInterest = principal;
  } else {
    const factor = Math.pow(1 + rate, installments);
    const payment = (principal * rate * factor) / (factor - 1);
    totalWithInterest = Math.round(payment * installments * 100) / 100;
  }
  const installmentAmount = Math.round((totalWithInterest / installments) * 100) / 100;
  return { totalWithInterest, installmentAmount, rate };
}

describe("Fiado > Payment Plan Generation", () => {
  it("should have 0% interest for 2 installments", () => {
    expect(INTEREST_RATES[2]).toBe(0);
  });

  it("should have 3% interest for 3 installments", () => {
    expect(INTEREST_RATES[3]).toBe(0.03);
  });

  it("should have 5% interest for 4 installments", () => {
    expect(INTEREST_RATES[4]).toBe(0.05);
  });

  it("should calculate 2 cuotas of S/50 for S/100 (0% interest)", () => {
    const plan = calculatePlan(100, 2);
    expect(plan.totalWithInterest).toBe(100);
    expect(plan.installmentAmount).toBe(50);
  });

  it("should calculate 3 cuotas with 3% monthly interest on S/100", () => {
    const plan = calculatePlan(100, 3);
    expect(plan.totalWithInterest).toBeGreaterThan(100);
    expect(plan.installmentAmount).toBeGreaterThan(33.33);
  });

  it("should only allow 2, 3, or 4 installments", () => {
    expect(ALLOWED_INSTALLMENTS).toEqual([2, 3, 4]);
  });
});
