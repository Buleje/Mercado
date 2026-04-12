/**
 * Eval: Split payment (partial Yape + cash).
 * Contract test: defines expected behavior for multi-method payments.
 * Business rule: sum of all payment amounts must equal order total.
 */
import { describe, it, expect } from "vitest";

type PaymentSplit = { method: "yape" | "efectivo"; amount: number };

function validatePaymentSplit(total: number, payments: PaymentSplit[]): {
  valid: boolean;
  error?: string;
} {
  if (payments.length === 0) return { valid: false, error: "No payments" };
  const sum = payments.reduce((s, p) => s + p.amount, 0);
  const diff = Math.abs(sum - total);
  if (diff > 0.01) {
    return {
      valid: false,
      error: `Payment sum S/${sum.toFixed(2)} != total S/${total.toFixed(2)}`,
    };
  }
  if (payments.some((p) => p.amount <= 0)) {
    return { valid: false, error: "Payment amount must be positive" };
  }
  return { valid: true };
}

describe("Checkout > Multi-Payment Split", () => {
  it("should accept exact split S/30 yape + S/20 cash = S/50", () => {
    const result = validatePaymentSplit(50, [
      { method: "yape", amount: 30 },
      { method: "efectivo", amount: 20 },
    ]);
    expect(result.valid).toBe(true);
  });

  it("should reject when sum does not match total", () => {
    const result = validatePaymentSplit(50, [
      { method: "yape", amount: 20 },
      { method: "efectivo", amount: 20 },
    ]);
    expect(result.valid).toBe(false);
  });

  it("should accept single payment matching total", () => {
    const result = validatePaymentSplit(35, [
      { method: "efectivo", amount: 35 },
    ]);
    expect(result.valid).toBe(true);
  });

  it("should reject zero-amount payments", () => {
    const result = validatePaymentSplit(50, [
      { method: "yape", amount: 50 },
      { method: "efectivo", amount: 0 },
    ]);
    expect(result.valid).toBe(false);
  });

  it("should reject empty payment array", () => {
    const result = validatePaymentSplit(50, []);
    expect(result.valid).toBe(false);
  });
});
