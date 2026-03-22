/**
 * __tests__/export-utils.test.ts
 *
 * Unit tests for lib/export-utils.ts
 * Tests formatProductsForExport, formatOrdersForExport, formatCustomersForExport.
 * exportToCSV / exportToJSON are browser-only (document/URL) — not unit-tested here.
 */

import { describe, it, expect } from "vitest";
import {
  formatProductsForExport,
  formatOrdersForExport,
  formatCustomersForExport,
} from "@/lib/export-utils";

// ── formatProductsForExport ───────────────────────────────────────────────────

describe("formatProductsForExport", () => {
  const baseProduct = {
    id: 1,
    name: "Arroz extra",
    category: "Granos",
    price: 5.5,
    costPrice: 3.8,
    stock: 120,
    stockMin: 20,
    unit: "kg",
    active: true,
  };

  it("maps a single product to the export shape", () => {
    const [row] = formatProductsForExport([baseProduct]);
    expect(row["ID"]).toBe(1);
    expect(row["Nombre"]).toBe("Arroz extra");
    expect(row["Categoría"]).toBe("Granos");
    expect(row["Precio (S/)"]).toBe(5.5);
    expect(row["Costo (S/)"]).toBe(3.8);
    expect(row["Stock"]).toBe(120);
    expect(row["Stock Mínimo"]).toBe(20);
    expect(row["Unidad"]).toBe("kg");
    expect(row["Activo"]).toBe("Sí");
  });

  it("shows 'No' for inactive products", () => {
    const [row] = formatProductsForExport([{ ...baseProduct, active: false }]);
    expect(row["Activo"]).toBe("No");
  });

  it("uses empty string when costPrice is missing", () => {
    const productWithoutCost = { ...baseProduct, costPrice: undefined };
    const [row] = formatProductsForExport([productWithoutCost]);
    expect(row["Costo (S/)"]).toBe("");
  });

  it("uses 0 for stockMin when missing", () => {
    const [row] = formatProductsForExport([{ ...baseProduct, stockMin: undefined }]);
    expect(row["Stock Mínimo"]).toBe(0);
  });

  it("returns empty array for empty input", () => {
    expect(formatProductsForExport([])).toEqual([]);
  });

  it("handles multiple products", () => {
    const rows = formatProductsForExport([baseProduct, { ...baseProduct, id: 2, name: "Azúcar" }]);
    expect(rows).toHaveLength(2);
    expect(rows[1]["Nombre"]).toBe("Azúcar");
  });
});

// ── formatOrdersForExport ─────────────────────────────────────────────────────

describe("formatOrdersForExport", () => {
  const baseOrder = {
    id: "ord-001",
    createdAt: "2026-01-15T10:00:00.000Z",
    status: "entregado",
    total: 55.0,
    paymentMethod: "yape",
    customer: { name: "María López", phone: "987654321" },
    items: [
      { name: "Arroz 1kg", quantity: 2, price: 5.5 },
      { name: "Aceite", quantity: 1, price: 8.0 },
    ],
  };

  it("maps a single order to the export shape", () => {
    const [row] = formatOrdersForExport([baseOrder]);
    expect(row["ID Pedido"]).toBe("ord-001");
    expect(row["Estado"]).toBe("entregado");
    expect(row["Cliente"]).toBe("María López");
    expect(row["Teléfono"]).toBe("987654321");
    expect(row["Total (S/)"]).toBe(55.0);
    expect(row["Método Pago"]).toBe("yape");
  });

  it("formats products as quantity x name joined by pipes", () => {
    const [row] = formatOrdersForExport([baseOrder]);
    expect(row["Productos"]).toBe("2x Arroz 1kg | 1x Aceite");
  });

  it("uses 'efectivo' as default payment method when absent", () => {
    const { paymentMethod: _omit, ...noMethod } = baseOrder;
    const [row] = formatOrdersForExport([noMethod]);
    expect(row["Método Pago"]).toBe("efectivo");
  });

  it("handles missing customer name gracefully", () => {
    const [row] = formatOrdersForExport([{ ...baseOrder, customer: { phone: "123" } }]);
    expect(row["Cliente"]).toBe("");
  });

  it("includes a formatted date string", () => {
    const [row] = formatOrdersForExport([baseOrder]);
    expect(typeof row["Fecha"]).toBe("string");
    expect(row["Fecha"].length).toBeGreaterThan(0);
  });

  it("returns empty array for empty input", () => {
    expect(formatOrdersForExport([])).toEqual([]);
  });
});

// ── formatCustomersForExport ──────────────────────────────────────────────────

describe("formatCustomersForExport", () => {
  const customerA = { phone: "987000001", name: "Carlos Ríos", location: "Jr. Lima 100", createdAt: "2026-01-01T00:00:00.000Z" };
  const customerB = { phone: "987000002", name: "Ana Torres" };

  const statsMap = new Map([
    ["987000001", { orderCount: 5, totalSpent: 250.0 }],
  ]);

  it("maps a customer with stats to the export shape", () => {
    const [row] = formatCustomersForExport([customerA], statsMap);
    expect(row["Nombre"]).toBe("Carlos Ríos");
    expect(row["Teléfono"]).toBe("987000001");
    expect(row["Dirección"]).toBe("Jr. Lima 100");
    expect(row["Pedidos"]).toBe(5);
    expect(row["Total Gastado (S/)"]).toBe("250.00");
  });

  it("shows 0 pedidos and '0.00' for customer without stats", () => {
    const [row] = formatCustomersForExport([customerB], statsMap);
    expect(row["Pedidos"]).toBe(0);
    expect(row["Total Gastado (S/)"]).toBe("0.00");
  });

  it("uses empty string for missing location", () => {
    const [row] = formatCustomersForExport([customerB], statsMap);
    expect(row["Dirección"]).toBe("");
  });

  it("uses empty string for missing createdAt", () => {
    const [row] = formatCustomersForExport([customerB], statsMap);
    expect(row["Registrado el"]).toBe("");
  });

  it("includes a formatted date string when createdAt is present", () => {
    const [row] = formatCustomersForExport([customerA], statsMap);
    expect(row["Registrado el"].length).toBeGreaterThan(0);
  });

  it("handles empty customers array", () => {
    expect(formatCustomersForExport([], statsMap)).toEqual([]);
  });
});
