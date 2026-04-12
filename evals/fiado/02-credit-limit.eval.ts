/**
 * Eval: Credit limit enforcement.
 * Contract test: verifies that purchases exceeding available credit are blocked.
 * Business rule: availableCredit = creditLimit - usedCredit. Cannot exceed.
 */
import { describe, it, expect } from "vitest";

type CreditProfile = {
  creditLimit: number;
  usedCredit: number;
  isActive: boolean;
};

function canGrantCredit(
  profile: CreditProfile,
  amount: number,
): { allowed: boolean; reason?: string } {
  if (!profile.isActive) return { allowed: false, reason: "Credit inactive" };
  const available = profile.creditLimit - profile.usedCredit;
  if (amount > available) {
    return {
      allowed: false,
      reason: `Insufficient credit: S/${available.toFixed(2)} available, S/${amount.toFixed(2)} requested`,
    };
  }
  return { allowed: true };
}

describe("Fiado > Credit Limit Enforcement", () => {
  it("should allow purchase within available credit", () => {
    const profile: CreditProfile = { creditLimit: 200, usedCredit: 50, isActive: true };
    expect(canGrantCredit(profile, 100).allowed).toBe(true);
  });

  it("should block purchase exceeding available credit", () => {
    const profile: CreditProfile = { creditLimit: 200, usedCredit: 150, isActive: true };
    const result = canGrantCredit(profile, 100);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Insufficient credit");
  });

  it("should allow purchase at exact available credit", () => {
    const profile: CreditProfile = { creditLimit: 200, usedCredit: 100, isActive: true };
    expect(canGrantCredit(profile, 100).allowed).toBe(true);
  });

  it("should block inactive credit profile", () => {
    const profile: CreditProfile = { creditLimit: 500, usedCredit: 0, isActive: false };
    const result = canGrantCredit(profile, 10);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Credit inactive");
  });

  it("should block when credit is fully used", () => {
    const profile: CreditProfile = { creditLimit: 50, usedCredit: 50, isActive: true };
    expect(canGrantCredit(profile, 1).allowed).toBe(false);
  });
});
