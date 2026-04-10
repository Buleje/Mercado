/**
 * Eval: Cart total calculation with N items.
 * Verifies that the cart total equals sum(price * quantity) for each item.
 * Business rule: totals are always computed server-side in PEN (S/.).
 */
import { describe, it, expect } from "vitest";

describe("Checkout > Cart Total Calculation", () => {
  const items = [
    { name: "Arroz Costeño 5kg", price: 22.5, quantity: 2 },
    { name: "Aceite Primor 1L", price: 11.9, quantity: 1 },
    { name: "Azúcar Rubia 1kg", price: 4.8, quantity: 3 },
  ];

  function calculateCartTotal(
    cartItems: { price: number; quantity: number }[],
  ): number {
    return cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  }

  it("should sum price * quantity for all items", () => {
    const total = calculateCartTotal(items);
    // 22.5*2 + 11.9*1 + 4.8*3 = 45 + 11.9 + 14.4 = 71.3
    expect(total).toBeCloseTo(71.3, 2);
  });

  it("should return 0 for an empty cart", () => {
    expect(calculateCartTotal([])).toBe(0);
  });

  it("should handle single item", () => {
    const total = calculateCartTotal([{ price: 15.5, quantity: 1 }]);
    expect(total).toBeCloseTo(15.5, 2);
  });

  it("should handle large quantities", () => {
    const total = calculateCartTotal([{ price: 3.5, quantity: 100 }]);
    expect(total).toBeCloseTo(350, 2);
  });
});
