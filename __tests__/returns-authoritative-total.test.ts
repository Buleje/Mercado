import { describe, it, expect } from "vitest";
import {
  resolveAuthoritativeReturn,
  ReturnValidationError,
  type SourceLineItem,
} from "@/lib/returns/authoritative-total";

const sourceItems: SourceLineItem[] = [
  { productId: 1, name: "Coca Cola 1.5L", price: 7.5, quantity: 3, unit: "und" },
  { productId: 2, name: "Pan francés", price: 0.5, quantity: 10, unit: "und" },
];

describe("resolveAuthoritativeReturn (anti-fraude de devoluciones)", () => {
  it("IGNORA el precio del cliente y usa el del comprobante original", () => {
    // El cliente intenta inflar el precio (700 en vez de 7.5) para más crédito.
    const { items, total } = resolveAuthoritativeReturn(sourceItems, [
      { productId: 1, quantity: 2 },
    ]);
    expect(total).toBe(15); // 7.5 (original) * 2, NO 700 * 2
    expect(items[0].price).toBe(7.5);
    expect(items[0].name).toBe("Coca Cola 1.5L");
    expect(items[0].unit).toBe("und");
  });

  it("suma el total multi-item con precios autoritativos", () => {
    const { total } = resolveAuthoritativeReturn(sourceItems, [
      { productId: 1, quantity: 1 }, // 7.5
      { productId: 2, quantity: 4 }, // 2.0
    ]);
    expect(total).toBe(9.5);
  });

  it("rechaza un producto que no pertenece al comprobante", () => {
    expect(() => resolveAuthoritativeReturn(sourceItems, [{ productId: 999, quantity: 1 }]))
      .toThrowError(ReturnValidationError);
  });

  it("rechaza cantidad mayor a la vendida (anti over-return)", () => {
    expect(() => resolveAuthoritativeReturn(sourceItems, [{ productId: 1, quantity: 5 }]))
      .toThrowError(/excede lo vendido/);
  });

  it("rechaza cantidad <= 0", () => {
    expect(() => resolveAuthoritativeReturn(sourceItems, [{ productId: 1, quantity: 0 }]))
      .toThrowError(ReturnValidationError);
  });

  it("rechaza item sin productId", () => {
    expect(() => resolveAuthoritativeReturn(sourceItems, [{ quantity: 1 }]))
      .toThrowError(/productId/);
  });
});
