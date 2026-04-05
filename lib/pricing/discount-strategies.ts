/**
 * lib/pricing/discount-strategies.ts
 *
 * Strategy Pattern for discount calculation.
 * 
 * Instead of a chain of if/else like:
 *   if (type === "volume") { ... }
 *   else if (type === "loyalty") { ... }
 *   else if (type === "coupon") { ... }
 *
 * Each discount type is a separate strategy class implementing the same
 * interface. Adding a new discount = adding a new class, zero changes 
 * to existing code (Open/Closed Principle).
 *
 * Usage:
 *   const engine = new DiscountEngine([
 *     new VolumeDiscountStrategy(),
 *     new LoyaltyDiscountStrategy(),
 *     new CouponDiscountStrategy(),
 *   ]);
 *   const result = engine.apply(orderContext);
 */

// ── Interface (the "contract" all strategies follow) ────────────────────────

export interface OrderContext {
  subtotal: number;
  itemCount: number;
  customerTotalPurchases: number;
  couponCode?: string;
  couponDiscountPercent?: number;
  isFirstPurchase?: boolean;
}

export interface DiscountResult {
  strategyName: string;
  discountAmount: number;
  reason: string;
}

export interface IDiscountStrategy {
  name: string;
  /** Return 0 if strategy doesn't apply */
  calculate(ctx: OrderContext): DiscountResult;
}

// ── Concrete strategies ─────────────────────────────────────────────────────

/**
 * Volume discount: bulk purchases get a percentage off.
 * 5+ items → 3%, 10+ → 5%, 20+ → 8%
 */
export class VolumeDiscountStrategy implements IDiscountStrategy {
  name = "Descuento por volumen";

  calculate(ctx: OrderContext): DiscountResult {
    let percent = 0;
    let reason = "";

    if (ctx.itemCount >= 20) {
      percent = 8;
      reason = "20+ productos: 8% de descuento por volumen";
    } else if (ctx.itemCount >= 10) {
      percent = 5;
      reason = "10+ productos: 5% de descuento por volumen";
    } else if (ctx.itemCount >= 5) {
      percent = 3;
      reason = "5+ productos: 3% de descuento por volumen";
    }

    return {
      strategyName: this.name,
      discountAmount: percent > 0 ? Math.round((ctx.subtotal * percent) / 100) : 0,
      reason,
    };
  }
}

/**
 * Loyalty discount: reward returning customers.
 * 5+ purchases → 2%, 20+ → 4%, 50+ → 6%
 */
export class LoyaltyDiscountStrategy implements IDiscountStrategy {
  name = "Descuento por fidelidad";

  calculate(ctx: OrderContext): DiscountResult {
    let percent = 0;
    let reason = "";

    if (ctx.customerTotalPurchases >= 50) {
      percent = 6;
      reason = "Cliente frecuente (50+ compras): 6% de descuento VIP";
    } else if (ctx.customerTotalPurchases >= 20) {
      percent = 4;
      reason = "Cliente habitual (20+ compras): 4% de descuento";
    } else if (ctx.customerTotalPurchases >= 5) {
      percent = 2;
      reason = "Cliente conocido (5+ compras): 2% de descuento";
    }

    return {
      strategyName: this.name,
      discountAmount: percent > 0 ? Math.round((ctx.subtotal * percent) / 100) : 0,
      reason,
    };
  }
}

/**
 * Coupon discount: apply a coupon code with a fixed percentage.
 */
export class CouponDiscountStrategy implements IDiscountStrategy {
  name = "Cupón de descuento";

  calculate(ctx: OrderContext): DiscountResult {
    if (!ctx.couponCode || !ctx.couponDiscountPercent) {
      return { strategyName: this.name, discountAmount: 0, reason: "" };
    }

    const percent = Math.min(ctx.couponDiscountPercent, 50); // Cap at 50%
    return {
      strategyName: this.name,
      discountAmount: Math.round((ctx.subtotal * percent) / 100),
      reason: `Cupón "${ctx.couponCode}": ${percent}% de descuento`,
    };
  }
}

/**
 * First purchase discount: welcome new customers.
 */
export class FirstPurchaseDiscountStrategy implements IDiscountStrategy {
  name = "Descuento primera compra";

  calculate(ctx: OrderContext): DiscountResult {
    if (!ctx.isFirstPurchase) {
      return { strategyName: this.name, discountAmount: 0, reason: "" };
    }

    const percent = 5;
    return {
      strategyName: this.name,
      discountAmount: Math.round((ctx.subtotal * percent) / 100),
      reason: "¡Bienvenido! 5% de descuento en tu primera compra",
    };
  }
}

// ── Discount Engine (applies all strategies and picks the best) ─────────────

export interface DiscountEngineResult {
  /** The winning discount (highest amount) */
  bestDiscount: DiscountResult | null;
  /** All discounts that applied (for transparency) */
  allApplicable: DiscountResult[];
  /** Final amount to pay */
  finalTotal: number;
}

/**
 * Applies all registered strategies and selects the best one.
 * "Best" = highest discount amount (most beneficial to customer).
 *
 * Strategies are NOT stacked — only the best one applies.
 * This prevents double-dipping (e.g., coupon + volume + loyalty all at once).
 */
export class DiscountEngine {
  constructor(private strategies: IDiscountStrategy[]) {}

  apply(ctx: OrderContext): DiscountEngineResult {
    const allApplicable: DiscountResult[] = [];

    for (const strategy of this.strategies) {
      const result = strategy.calculate(ctx);
      if (result.discountAmount > 0) {
        allApplicable.push(result);
      }
    }

    // Pick the best discount
    const bestDiscount = allApplicable.length > 0
      ? allApplicable.reduce((a, b) => (a.discountAmount > b.discountAmount ? a : b))
      : null;

    const discountAmount = bestDiscount?.discountAmount ?? 0;

    return {
      bestDiscount,
      allApplicable,
      finalTotal: Math.max(0, ctx.subtotal - discountAmount),
    };
  }

  /** Add a new strategy at runtime */
  addStrategy(strategy: IDiscountStrategy): void {
    this.strategies.push(strategy);
  }
}

// ── Default engine with all built-in strategies ─────────────────────────────

export function createDefaultDiscountEngine(): DiscountEngine {
  return new DiscountEngine([
    new VolumeDiscountStrategy(),
    new LoyaltyDiscountStrategy(),
    new CouponDiscountStrategy(),
    new FirstPurchaseDiscountStrategy(),
  ]);
}
