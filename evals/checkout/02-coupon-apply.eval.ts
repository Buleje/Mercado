/**
 * Eval: Coupon discount application.
 * Tests percentage, fixed amount, and minimum purchase coupons.
 * Business rule: couponDiscount is stored on Order and deducted from total.
 */
import { describe, it, expect } from "vitest";

type Coupon = {
  code: string;
  type: "percentage" | "fixed";
  value: number;
  minPurchase?: number;
};

function applyCoupon(subtotal: number, coupon: Coupon): number {
  if (coupon.minPurchase && subtotal < coupon.minPurchase) return 0;
  if (coupon.type === "percentage") {
    return +(subtotal * (coupon.value / 100)).toFixed(2);
  }
  return Math.min(coupon.value, subtotal);
}

describe("Checkout > Coupon Application", () => {
  it("should apply 10% discount", () => {
    const discount = applyCoupon(100, { code: "DESC10", type: "percentage", value: 10 });
    expect(discount).toBe(10);
  });

  it("should apply S/5 fixed discount", () => {
    const discount = applyCoupon(50, { code: "FIJO5", type: "fixed", value: 5 });
    expect(discount).toBe(5);
  });

  it("should not exceed subtotal on fixed coupon", () => {
    const discount = applyCoupon(3, { code: "FIJO5", type: "fixed", value: 5 });
    expect(discount).toBe(3);
  });

  it("should reject coupon below minimum purchase", () => {
    const discount = applyCoupon(20, {
      code: "MIN50", type: "percentage", value: 15, minPurchase: 50,
    });
    expect(discount).toBe(0);
  });

  it("should apply coupon at exact minimum purchase", () => {
    const discount = applyCoupon(50, {
      code: "MIN50", type: "percentage", value: 15, minPurchase: 50,
    });
    expect(discount).toBeCloseTo(7.5, 2);
  });
});
