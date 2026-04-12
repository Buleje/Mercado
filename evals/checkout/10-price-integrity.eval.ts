/**
 * Eval: Prices come from DB not client.
 * Business rule: the backend must recompute totals from DB prices.
 * Client-submitted prices are informational only (antifraude).
 */
import { describe, it, expect } from "vitest";

type DbProduct = { id: number; price: number };
type ClientItem = { id: number; price: number; quantity: number };

function recomputeTotal(
  clientItems: ClientItem[],
  dbProducts: DbProduct[],
): { total: number; tampered: boolean } {
  let total = 0;
  let tampered = false;
  for (const item of clientItems) {
    const dbProduct = dbProducts.find((p) => p.id === item.id);
    if (!dbProduct) continue;
    if (Math.abs(dbProduct.price - item.price) > 0.01) {
      tampered = true;
    }
    total += dbProduct.price * item.quantity;
  }
  return { total: +total.toFixed(2), tampered };
}

describe("Checkout > Price Integrity", () => {
  const dbProducts: DbProduct[] = [
    { id: 1, price: 22.5 },
    { id: 2, price: 11.9 },
  ];

  it("should match when client prices equal DB prices", () => {
    const result = recomputeTotal(
      [{ id: 1, price: 22.5, quantity: 2 }, { id: 2, price: 11.9, quantity: 1 }],
      dbProducts,
    );
    expect(result.total).toBeCloseTo(56.9, 2);
    expect(result.tampered).toBe(false);
  });

  it("should detect tampered client price", () => {
    const result = recomputeTotal(
      [{ id: 1, price: 1.0, quantity: 2 }],
      dbProducts,
    );
    expect(result.total).toBeCloseTo(45, 2);
    expect(result.tampered).toBe(true);
  });

  it("should use DB price even if client sends 0", () => {
    const result = recomputeTotal(
      [{ id: 2, price: 0, quantity: 3 }],
      dbProducts,
    );
    expect(result.total).toBeCloseTo(35.7, 2);
    expect(result.tampered).toBe(true);
  });

  it("should skip unknown product IDs", () => {
    const result = recomputeTotal(
      [{ id: 999, price: 100, quantity: 1 }],
      dbProducts,
    );
    expect(result.total).toBe(0);
  });
});
