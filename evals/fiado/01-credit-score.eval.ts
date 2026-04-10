/**
 * Eval: Credit score calculation.
 * Tests determineCreditLimit and classifyRisk from scoring-engine.ts.
 * Business rule: score 0-1000, weighted by purchase history, punctuality,
 * avg ticket, seniority, and loyalty. Real functions imported.
 */
import { describe, it, expect } from "vitest";
import { determineCreditLimit, classifyRisk } from "@/lib/credit/scoring-engine";

describe("Fiado > Credit Score Calculation", () => {
  it("score < 300 should give S/0 credit limit", () => {
    expect(determineCreditLimit(0)).toBe(0);
    expect(determineCreditLimit(150)).toBe(0);
    expect(determineCreditLimit(299)).toBe(0);
  });

  it("score 300-499 should give S/50 credit limit", () => {
    expect(determineCreditLimit(300)).toBe(50);
    expect(determineCreditLimit(400)).toBe(50);
    expect(determineCreditLimit(499)).toBe(50);
  });

  it("score 500-699 should give S/200 credit limit", () => {
    expect(determineCreditLimit(500)).toBe(200);
    expect(determineCreditLimit(699)).toBe(200);
  });

  it("score 700-899 should give S/500 credit limit", () => {
    expect(determineCreditLimit(700)).toBe(500);
    expect(determineCreditLimit(899)).toBe(500);
  });

  it("score 900+ should give S/1000 credit limit", () => {
    expect(determineCreditLimit(900)).toBe(1000);
    expect(determineCreditLimit(1000)).toBe(1000);
  });

  it("should classify risk levels correctly", () => {
    expect(classifyRisk(800)).toBe("none");
    expect(classifyRisk(600)).toBe("low");
    expect(classifyRisk(400)).toBe("medium");
    expect(classifyRisk(200)).toBe("high");
  });
});
