/**
 * Tests para los Zod schemas de Ola 1 — Retención Marketplace.
 * ADR-059.
 *
 * Cubre:
 *  1. AddFavoriteSchema acepta datos válidos y rechaza productId <= 0.
 *  2. CheckFavoritesSchema acepta lista CSV de enteros y rechaza alfanuméricos.
 *  3. CreateShoppingListSchema respeta longitud 1-50 y hace trim.
 *  4. AddShoppingListItemSchema aplica default quantity = 1.
 *  5. ValidateCouponSchema normaliza el código a UPPERCASE y hace trim.
 *  6. RedeemCouponSchema requiere orderId no vacío.
 */

import { describe, it, expect } from "vitest";
import {
  AddFavoriteSchema,
  CheckFavoritesSchema,
} from "@/lib/validations/favorite.schema";
import {
  CreateShoppingListSchema,
  AddShoppingListItemSchema,
  UpdateShoppingListItemSchema,
} from "@/lib/validations/shopping-list.schema";
import {
  ValidateCouponSchema,
  RedeemCouponSchema,
} from "@/lib/validations/coupon-redeem.schema";

describe("favorite.schema", () => {
  it("accepts valid payload", () => {
    const parsed = AddFavoriteSchema.safeParse({
      productId: 42,
      storeId: "store-abc",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects non-positive productId", () => {
    const parsed = AddFavoriteSchema.safeParse({ productId: 0, storeId: "s" });
    expect(parsed.success).toBe(false);
  });

  it("rejects empty storeId", () => {
    const parsed = AddFavoriteSchema.safeParse({ productId: 1, storeId: "" });
    expect(parsed.success).toBe(false);
  });

  it("CheckFavoritesSchema accepts CSV of positive integers", () => {
    const parsed = CheckFavoritesSchema.safeParse({ productIds: "1,2,3,42" });
    expect(parsed.success).toBe(true);
  });

  it("CheckFavoritesSchema rejects alphanumeric payload", () => {
    const parsed = CheckFavoritesSchema.safeParse({ productIds: "1,a,3" });
    expect(parsed.success).toBe(false);
  });
});

describe("shopping-list.schema", () => {
  it("CreateShoppingListSchema trims whitespace", () => {
    const parsed = CreateShoppingListSchema.safeParse({ name: "  Semana  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe("Semana");
  });

  it("CreateShoppingListSchema rejects >50 chars", () => {
    const longName = "x".repeat(51);
    const parsed = CreateShoppingListSchema.safeParse({ name: longName });
    expect(parsed.success).toBe(false);
  });

  it("AddShoppingListItemSchema applies default quantity=1", () => {
    const parsed = AddShoppingListItemSchema.safeParse({ productId: 7 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.quantity).toBe(1);
  });

  it("AddShoppingListItemSchema caps quantity at 99", () => {
    const parsed = AddShoppingListItemSchema.safeParse({
      productId: 7,
      quantity: 100,
    });
    expect(parsed.success).toBe(false);
  });

  it("UpdateShoppingListItemSchema accepts partial updates", () => {
    const parsed = UpdateShoppingListItemSchema.safeParse({ quantity: 5 });
    expect(parsed.success).toBe(true);
  });
});

describe("coupon-redeem.schema", () => {
  it("ValidateCouponSchema uppercases the code", () => {
    const parsed = ValidateCouponSchema.safeParse({
      code: "welcome20",
      cartTotal: 50,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.code).toBe("WELCOME20");
  });

  it("ValidateCouponSchema rejects empty code", () => {
    const parsed = ValidateCouponSchema.safeParse({ code: "ab", cartTotal: 10 });
    expect(parsed.success).toBe(false);
  });

  it("ValidateCouponSchema rejects zero cart total", () => {
    const parsed = ValidateCouponSchema.safeParse({
      code: "ABCDE",
      cartTotal: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it("RedeemCouponSchema requires orderId", () => {
    const parsed = RedeemCouponSchema.safeParse({
      code: "WELCOME20",
      orderId: "",
      discountApplied: 5,
    });
    expect(parsed.success).toBe(false);
  });

  it("RedeemCouponSchema accepts a full payload", () => {
    const parsed = RedeemCouponSchema.safeParse({
      code: "welcome20",
      orderId: "ORD-123",
      discountApplied: 5.5,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.code).toBe("WELCOME20");
  });
});
