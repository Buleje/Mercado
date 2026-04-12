/**
 * Eval: Stock check before checkout.
 * Contract test: verifies that orders cannot be placed for out-of-stock items.
 * Business rule: stock must be >= requested quantity at checkout time.
 */
import { describe, it, expect } from "vitest";

type StockItem = { productId: number; name: string; stock: number };
type CartEntry = { productId: number; quantity: number };
type StockError = { productId: number; requested: number; available: number };

function validateStock(
  inventory: StockItem[],
  cart: CartEntry[],
): StockError[] {
  const errors: StockError[] = [];
  for (const entry of cart) {
    const item = inventory.find((p) => p.productId === entry.productId);
    const available = item?.stock ?? 0;
    if (available < entry.quantity) {
      errors.push({
        productId: entry.productId,
        requested: entry.quantity,
        available,
      });
    }
  }
  return errors;
}

describe("Checkout > Stock Validation", () => {
  const inventory: StockItem[] = [
    { productId: 1, name: "Arroz 5kg", stock: 10 },
    { productId: 2, name: "Aceite 1L", stock: 3 },
    { productId: 3, name: "Fideos", stock: 0 },
  ];

  it("should pass when stock is sufficient", () => {
    const errors = validateStock(inventory, [{ productId: 1, quantity: 5 }]);
    expect(errors).toHaveLength(0);
  });

  it("should fail when quantity exceeds stock", () => {
    const errors = validateStock(inventory, [{ productId: 2, quantity: 5 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({ productId: 2, requested: 5, available: 3 });
  });

  it("should fail for out-of-stock items", () => {
    const errors = validateStock(inventory, [{ productId: 3, quantity: 1 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0].available).toBe(0);
  });

  it("should fail for unknown product IDs", () => {
    const errors = validateStock(inventory, [{ productId: 999, quantity: 1 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0].available).toBe(0);
  });
});
