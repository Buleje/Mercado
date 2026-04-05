import { describe, it, expect } from "vitest";
import {
  VolumeDiscountStrategy,
  LoyaltyDiscountStrategy,
  CouponDiscountStrategy,
  FirstPurchaseDiscountStrategy,
  DiscountEngine,
  createDefaultDiscountEngine,
  type OrderContext,
} from "@/lib/pricing/discount-strategies";

describe("Strategy Pattern — Discount Strategies", () => {
  // ── Volume strategy ───────────────────────────────────────────────────────

  describe("VolumeDiscountStrategy", () => {
    const strategy = new VolumeDiscountStrategy();

    it("no discount for less than 5 items", () => {
      const ctx: OrderContext = { subtotal: 100, itemCount: 3, customerTotalPurchases: 0 };
      const result = strategy.calculate(ctx);
      expect(result.discountAmount).toBe(0);
    });

    it("3% for 5-9 items", () => {
      const ctx: OrderContext = { subtotal: 100, itemCount: 7, customerTotalPurchases: 0 };
      const result = strategy.calculate(ctx);
      expect(result.discountAmount).toBe(3);
      expect(result.reason).toContain("3%");
    });

    it("5% for 10-19 items", () => {
      const ctx: OrderContext = { subtotal: 200, itemCount: 15, customerTotalPurchases: 0 };
      const result = strategy.calculate(ctx);
      expect(result.discountAmount).toBe(10);
    });

    it("8% for 20+ items", () => {
      const ctx: OrderContext = { subtotal: 1000, itemCount: 25, customerTotalPurchases: 0 };
      const result = strategy.calculate(ctx);
      expect(result.discountAmount).toBe(80);
    });
  });

  // ── Loyalty strategy ──────────────────────────────────────────────────────

  describe("LoyaltyDiscountStrategy", () => {
    const strategy = new LoyaltyDiscountStrategy();

    it("no discount for new customer", () => {
      const ctx: OrderContext = { subtotal: 100, itemCount: 1, customerTotalPurchases: 2 };
      const result = strategy.calculate(ctx);
      expect(result.discountAmount).toBe(0);
    });

    it("2% for 5+ purchases", () => {
      const ctx: OrderContext = { subtotal: 100, itemCount: 1, customerTotalPurchases: 8 };
      const result = strategy.calculate(ctx);
      expect(result.discountAmount).toBe(2);
    });

    it("4% for 20+ purchases", () => {
      const ctx: OrderContext = { subtotal: 100, itemCount: 1, customerTotalPurchases: 30 };
      const result = strategy.calculate(ctx);
      expect(result.discountAmount).toBe(4);
    });

    it("6% VIP for 50+ purchases", () => {
      const ctx: OrderContext = { subtotal: 500, itemCount: 1, customerTotalPurchases: 60 };
      const result = strategy.calculate(ctx);
      expect(result.discountAmount).toBe(30);
      expect(result.reason).toContain("VIP");
    });
  });

  // ── Coupon strategy ───────────────────────────────────────────────────────

  describe("CouponDiscountStrategy", () => {
    const strategy = new CouponDiscountStrategy();

    it("no discount without coupon", () => {
      const ctx: OrderContext = { subtotal: 100, itemCount: 1, customerTotalPurchases: 0 };
      const result = strategy.calculate(ctx);
      expect(result.discountAmount).toBe(0);
    });

    it("applies coupon percentage", () => {
      const ctx: OrderContext = {
        subtotal: 200,
        itemCount: 1,
        customerTotalPurchases: 0,
        couponCode: "VERANO20",
        couponDiscountPercent: 20,
      };
      const result = strategy.calculate(ctx);
      expect(result.discountAmount).toBe(40);
      expect(result.reason).toContain("VERANO20");
    });

    it("caps coupon at 50%", () => {
      const ctx: OrderContext = {
        subtotal: 100,
        itemCount: 1,
        customerTotalPurchases: 0,
        couponCode: "MEGA90",
        couponDiscountPercent: 90,
      };
      const result = strategy.calculate(ctx);
      expect(result.discountAmount).toBe(50); // Capped at 50%
    });
  });

  // ── First purchase strategy ───────────────────────────────────────────────

  describe("FirstPurchaseDiscountStrategy", () => {
    const strategy = new FirstPurchaseDiscountStrategy();

    it("5% for first purchase", () => {
      const ctx: OrderContext = {
        subtotal: 200,
        itemCount: 1,
        customerTotalPurchases: 0,
        isFirstPurchase: true,
      };
      const result = strategy.calculate(ctx);
      expect(result.discountAmount).toBe(10);
      expect(result.reason).toContain("primera compra");
    });

    it("no discount for returning customer", () => {
      const ctx: OrderContext = {
        subtotal: 200,
        itemCount: 1,
        customerTotalPurchases: 5,
        isFirstPurchase: false,
      };
      const result = strategy.calculate(ctx);
      expect(result.discountAmount).toBe(0);
    });
  });

  // ── DiscountEngine ────────────────────────────────────────────────────────

  describe("DiscountEngine", () => {
    it("selects the best discount (highest amount)", () => {
      const engine = createDefaultDiscountEngine();
      const ctx: OrderContext = {
        subtotal: 500,
        itemCount: 15,       // 5% volume = 25
        customerTotalPurchases: 55, // 6% loyalty = 30
        couponCode: "OFERTA10",
        couponDiscountPercent: 10,  // 10% coupon = 50
      };

      const result = engine.apply(ctx);
      expect(result.bestDiscount).not.toBeNull();
      expect(result.bestDiscount!.strategyName).toBe("Cupón de descuento");
      expect(result.bestDiscount!.discountAmount).toBe(50);
      expect(result.finalTotal).toBe(450);
    });

    it("returns null when no discount applies", () => {
      const engine = createDefaultDiscountEngine();
      const ctx: OrderContext = {
        subtotal: 50,
        itemCount: 1,
        customerTotalPurchases: 0,
      };

      const result = engine.apply(ctx);
      expect(result.bestDiscount).toBeNull();
      expect(result.allApplicable).toHaveLength(0);
      expect(result.finalTotal).toBe(50);
    });

    it("lists all applicable discounts for transparency", () => {
      const engine = createDefaultDiscountEngine();
      const ctx: OrderContext = {
        subtotal: 1000,
        itemCount: 25,          // Volume applies
        customerTotalPurchases: 60, // Loyalty applies
      };

      const result = engine.apply(ctx);
      expect(result.allApplicable.length).toBeGreaterThanOrEqual(2);
    });

    it("addStrategy registers new strategy at runtime", () => {
      const engine = new DiscountEngine([]);
      engine.addStrategy(new VolumeDiscountStrategy());

      const ctx: OrderContext = {
        subtotal: 100,
        itemCount: 10,
        customerTotalPurchases: 0,
      };

      const result = engine.apply(ctx);
      expect(result.bestDiscount).not.toBeNull();
    });

    it("finalTotal never goes below zero", () => {
      const engine = createDefaultDiscountEngine();
      const ctx: OrderContext = {
        subtotal: 10,
        itemCount: 1,
        customerTotalPurchases: 0,
        couponCode: "GRATIS",
        couponDiscountPercent: 50, // capped at 50% → 5
      };

      const result = engine.apply(ctx);
      expect(result.finalTotal).toBeGreaterThanOrEqual(0);
    });
  });
});
