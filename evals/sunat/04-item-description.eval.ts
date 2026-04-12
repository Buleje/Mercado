/**
 * Eval: Item description requirements for SUNAT invoices.
 * Business rule: each item must have a non-empty description, quantity > 0,
 * and precio unitario > 0. SUNAT rejects empty descriptions.
 */
import { describe, it, expect } from "vitest";

type InvoiceItem = {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
};

function validateInvoiceItem(item: InvoiceItem): string[] {
  const errors: string[] = [];
  if (!item.descripcion || item.descripcion.trim().length === 0) {
    errors.push("Descripcion is required");
  }
  if (item.descripcion && item.descripcion.length > 250) {
    errors.push("Descripcion exceeds 250 characters");
  }
  if (item.cantidad <= 0) {
    errors.push("Cantidad must be > 0");
  }
  if (item.precioUnitario <= 0) {
    errors.push("Precio unitario must be > 0");
  }
  return errors;
}

describe("SUNAT > Item Description Requirements", () => {
  it("should accept valid item", () => {
    const errors = validateInvoiceItem({
      descripcion: "Arroz Costeño 5kg", cantidad: 2, precioUnitario: 22.5,
    });
    expect(errors).toHaveLength(0);
  });

  it("should reject empty description", () => {
    const errors = validateInvoiceItem({
      descripcion: "", cantidad: 1, precioUnitario: 10,
    });
    expect(errors).toContain("Descripcion is required");
  });

  it("should reject description over 250 chars", () => {
    const errors = validateInvoiceItem({
      descripcion: "A".repeat(251), cantidad: 1, precioUnitario: 10,
    });
    expect(errors).toContain("Descripcion exceeds 250 characters");
  });

  it("should reject quantity = 0", () => {
    const errors = validateInvoiceItem({
      descripcion: "Producto", cantidad: 0, precioUnitario: 10,
    });
    expect(errors).toContain("Cantidad must be > 0");
  });

  it("should reject negative price", () => {
    const errors = validateInvoiceItem({
      descripcion: "Producto", cantidad: 1, precioUnitario: -5,
    });
    expect(errors).toContain("Precio unitario must be > 0");
  });
});
