/**
 * __tests__/zod-schemas.test.ts
 *
 * Unit tests for the Zod validation schemas used in the most critical
 * API routes: products, customers, orders, and inventory movements.
 *
 * These schemas are inline in the route files; we reproduce them here
 * so tests don't depend on Next.js route imports.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── Re-declare schemas exactly as they appear in the route files ──────────────

const ProductPostSchema = z.object({
  name: z.string().min(1).max(150),
  category: z.string().min(1).max(100),
  price: z.number().positive(),
  image: z.string().max(500).optional(),
  unit: z.string().max(20).optional(),
  badge: z.string().max(50).optional(),
  stock: z.number().min(0).optional(),
  stockMin: z.number().min(0).optional(),
});

const CustomerPostSchema = z.object({
  phone: z.string().min(6).max(20),
  name: z.string().min(1).max(100),
  location: z.string().max(500).optional(),
  reference: z.string().max(300).optional(),
  birthday: z.string().max(30).nullable().optional(),
});

const OrderItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().min(1),
  unit: z.string(),
});

const OrderPostSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    location: z.string().optional(),
    reference: z.string().optional(),
  }),
  items: z.array(OrderItemSchema).min(1),
  total: z.number().nonnegative(),
  paymentMethod: z.enum(["efectivo", "yape", "plin", "transferencia", "credito"]).optional(),
  notes: z.string().max(500).optional(),
  deliverySlot: z.string().max(100).optional(),
});

const InventoryAdjustSchema = z.object({
  productId: z.number().int().positive(),
  newStock: z.number().min(0),
  notes: z.string().max(300).optional(),
});

// ── ProductPostSchema ─────────────────────────────────────────────────────────

describe("ProductPostSchema", () => {
  const valid = { name: "Arroz 1kg", category: "Granos", price: 5.5, unit: "kg" };

  it("accepts a valid product", () => {
    expect(ProductPostSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(ProductPostSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects name over 150 chars", () => {
    expect(ProductPostSchema.safeParse({ ...valid, name: "x".repeat(151) }).success).toBe(false);
  });

  it("rejects negative price", () => {
    expect(ProductPostSchema.safeParse({ ...valid, price: -1 }).success).toBe(false);
  });

  it("rejects zero price", () => {
    expect(ProductPostSchema.safeParse({ ...valid, price: 0 }).success).toBe(false);
  });

  it("rejects empty category", () => {
    expect(ProductPostSchema.safeParse({ ...valid, category: "" }).success).toBe(false);
  });

  it("accepts optional fields when present", () => {
    expect(ProductPostSchema.safeParse({ ...valid, stock: 0, stockMin: 5, badge: "oferta" }).success).toBe(true);
  });

  it("rejects negative stock", () => {
    expect(ProductPostSchema.safeParse({ ...valid, stock: -1 }).success).toBe(false);
  });

  it("accepts missing optional fields", () => {
    const minimal = { name: "X", category: "Y", price: 1 };
    expect(ProductPostSchema.safeParse(minimal).success).toBe(true);
  });
});

// ── CustomerPostSchema ────────────────────────────────────────────────────────

describe("CustomerPostSchema", () => {
  const valid = { phone: "987654321", name: "Juan Pérez" };

  it("accepts a valid customer", () => {
    expect(CustomerPostSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects phone shorter than 6 characters", () => {
    expect(CustomerPostSchema.safeParse({ ...valid, phone: "12345" }).success).toBe(false);
  });

  it("rejects phone longer than 20 characters", () => {
    expect(CustomerPostSchema.safeParse({ ...valid, phone: "1".repeat(21) }).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(CustomerPostSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects name over 100 chars", () => {
    expect(CustomerPostSchema.safeParse({ ...valid, name: "a".repeat(101) }).success).toBe(false);
  });

  it("accepts optional location", () => {
    expect(CustomerPostSchema.safeParse({ ...valid, location: "Jr. Lima 100" }).success).toBe(true);
  });

  it("accepts null birthday", () => {
    expect(CustomerPostSchema.safeParse({ ...valid, birthday: null }).success).toBe(true);
  });

  it("rejects missing phone", () => {
    expect(CustomerPostSchema.safeParse({ name: "Juan" }).success).toBe(false);
  });
});

// ── OrderPostSchema ───────────────────────────────────────────────────────────

describe("OrderPostSchema", () => {
  const validItem = { id: 1, name: "Arroz", price: 5.5, quantity: 2, unit: "kg" };
  const valid = {
    customer: { name: "María López" },
    items: [validItem],
    total: 11.0,
  };

  it("accepts a minimal valid order", () => {
    expect(OrderPostSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty customer name", () => {
    expect(OrderPostSchema.safeParse({ ...valid, customer: { name: "" } }).success).toBe(false);
  });

  it("rejects empty items array", () => {
    expect(OrderPostSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
  });

  it("rejects item with quantity 0", () => {
    expect(OrderPostSchema.safeParse({ ...valid, items: [{ ...validItem, quantity: 0 }] }).success).toBe(false);
  });

  it("rejects item with negative price", () => {
    expect(OrderPostSchema.safeParse({ ...valid, items: [{ ...validItem, price: -1 }] }).success).toBe(false);
  });

  it("rejects item with empty name", () => {
    expect(OrderPostSchema.safeParse({ ...valid, items: [{ ...validItem, name: "" }] }).success).toBe(false);
  });

  it("rejects invalid paymentMethod", () => {
    expect(OrderPostSchema.safeParse({ ...valid, paymentMethod: "cripto" }).success).toBe(false);
  });

  it("accepts all valid paymentMethod values", () => {
    for (const method of ["efectivo", "yape", "plin", "transferencia", "credito"] as const) {
      expect(OrderPostSchema.safeParse({ ...valid, paymentMethod: method }).success).toBe(true);
    }
  });

  it("accepts optional notes and deliverySlot", () => {
    expect(OrderPostSchema.safeParse({
      ...valid,
      notes: "Sin cebolla",
      deliverySlot: "09:00 - 12:00",
    }).success).toBe(true);
  });

  it("rejects notes over 500 chars", () => {
    expect(OrderPostSchema.safeParse({ ...valid, notes: "x".repeat(501) }).success).toBe(false);
  });

  it("rejects negative total", () => {
    expect(OrderPostSchema.safeParse({ ...valid, total: -1 }).success).toBe(false);
  });

  it("accepts total = 0", () => {
    expect(OrderPostSchema.safeParse({ ...valid, total: 0 }).success).toBe(true);
  });

  it("accepts multiple items", () => {
    expect(OrderPostSchema.safeParse({
      ...valid,
      items: [validItem, { ...validItem, id: 2, name: "Aceite" }],
    }).success).toBe(true);
  });
});

// ── InventoryAdjustSchema ─────────────────────────────────────────────────────

describe("InventoryAdjustSchema", () => {
  const valid = { productId: 1, newStock: 50 };

  it("accepts a valid adjustment", () => {
    expect(InventoryAdjustSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts newStock = 0 (full depletion)", () => {
    expect(InventoryAdjustSchema.safeParse({ ...valid, newStock: 0 }).success).toBe(true);
  });

  it("rejects negative newStock", () => {
    expect(InventoryAdjustSchema.safeParse({ ...valid, newStock: -1 }).success).toBe(false);
  });

  it("rejects productId = 0", () => {
    expect(InventoryAdjustSchema.safeParse({ ...valid, productId: 0 }).success).toBe(false);
  });

  it("rejects negative productId", () => {
    expect(InventoryAdjustSchema.safeParse({ ...valid, productId: -5 }).success).toBe(false);
  });

  it("rejects non-integer productId", () => {
    expect(InventoryAdjustSchema.safeParse({ ...valid, productId: 1.5 }).success).toBe(false);
  });

  it("accepts optional notes", () => {
    expect(InventoryAdjustSchema.safeParse({ ...valid, notes: "Ajuste por merma" }).success).toBe(true);
  });

  it("rejects notes over 300 chars", () => {
    expect(InventoryAdjustSchema.safeParse({ ...valid, notes: "x".repeat(301) }).success).toBe(false);
  });
});
