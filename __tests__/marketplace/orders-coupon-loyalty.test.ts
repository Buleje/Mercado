/**
 * orders-coupon-loyalty.test.ts
 *
 * Cobertura: MarketplaceOrdersDB.createFromCart — cupones + loyalty points.
 *
 * Todos los mocks van antes del primer import de la SUT para que vi.hoisted
 * los resuelva correctamente.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Mocks Prisma (hoisted) ────────────────────────────────────────────────────

const {
  mockStoreFindUnique,
  mockStoreProductFindMany,
  mockProductFindMany,
  mockOrderCount,
  mockCustomerFindFirst,
  mockCustomerCreate,
  mockCouponFindFirst,
  mockTransaction,
} = vi.hoisted(() => ({
  mockStoreFindUnique:    vi.fn(),
  mockStoreProductFindMany: vi.fn(),
  mockProductFindMany:    vi.fn(),
  mockOrderCount:         vi.fn(),
  mockCustomerFindFirst:  vi.fn(),
  mockCustomerCreate:     vi.fn(),
  mockCouponFindFirst:    vi.fn(),
  mockTransaction:        vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    store:        { findUnique: mockStoreFindUnique },
    storeProduct: { findMany: mockStoreProductFindMany },
    order:        { count: mockOrderCount },
    customer:     { findFirst: mockCustomerFindFirst, create: mockCustomerCreate },
    coupon:       { findFirst: mockCouponFindFirst },
    product:      { findMany: mockProductFindMany },
    // P0-1 fix (audit 2026-05-23): CommissionsDB.computeVendorTier llama
    // prisma.commissionLedger.findMany para calcular tier dinámico. Mock vacío
    // → tier base (sin volumen previo).
    commissionLedger: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/cache", () => ({
  getOrSet:         vi.fn((_k: string, _t: number, fn: () => unknown) => fn()),
  invalidateByPrefix: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { MarketplaceOrdersDB } from "@/lib/db/marketplace.db";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STORE = {
  id: "store-1", tenantId: "tenant-1", name: "Bodega Test",
  slug: "bodega-test", isPublished: true, commission: 5,
};

const STORE_PRODUCT = {
  id: "sp-1", productId: 42, retailPrice: 10, minOrderQty: 1,
};

const CART_ITEM = {
  storeProductId: "sp-1", productId: 42, name: "Arroz", quantity: 3,
  retailPrice: 10, unit: "kg",
};

const COMMON_PARAMS = {
  storeSlug:       "bodega-test",
  customerName:    "Ana López",
  customerPhone:   "999888777",
  customerAddress: "Jr. Lima 123",
  items:           [CART_ITEM],
};

/** Simula la transacción atómica de forma exitosa */
function successTx() {
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      product:          {
        findFirst:  vi.fn().mockResolvedValue({ stock: 10 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      order:            {
        create: vi.fn().mockResolvedValue({}),
        // PENTEST Sprint A #2: nuevo check de TOCTOU usa tx.order.count
        // adentro de la $transaction. Default 0 = primer uso del cupón.
        count:  vi.fn().mockResolvedValue(0),
      },
      commissionLedger: { create:     vi.fn().mockResolvedValue({}) },
      coupon:           {
        update:      vi.fn().mockResolvedValue({}),
        findUnique:  vi.fn().mockResolvedValue({ maxUses: 1, usedCount: 1 }),
      },
      customer:         { updateMany: vi.fn().mockResolvedValue({}) },
    };
    return fn(tx);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MarketplaceOrdersDB.createFromCart — cupones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreFindUnique.mockResolvedValue(STORE);
    mockStoreProductFindMany.mockResolvedValue([STORE_PRODUCT]);
    mockProductFindMany.mockResolvedValue([{ id: 42, stock: 100, name: "Arroz" }]);
    mockOrderCount.mockResolvedValue(0);
    mockCustomerFindFirst.mockResolvedValue({ phone: "999888777" });
    successTx();
  });

  it("cupón percent 10% reduce el total correctamente y llama coupon.update", async () => {
    // subtotal = 3 * 10 = 30 → 10% = 3 → total = 27
    mockCouponFindFirst.mockResolvedValue({
      id: "coupon-1", discountType: "percent", discountValue: 10,
      maxUses: 10, usedCount: 0,
    });

    const result = await MarketplaceOrdersDB.createFromCart({
      ...COMMON_PARAMS,
      couponCode: "DESC10",
    });

    expect(result.total).toBe(27);
    // Dentro de la tx se llamó coupon.update
    const txArg = mockTransaction.mock.calls[0][0];
    const tx = {
      product:          {
        findFirst:  vi.fn().mockResolvedValue({ stock: 10 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      order:            {
        create: vi.fn().mockResolvedValue({}),
        // PENTEST Sprint A #2: nuevo check de TOCTOU usa tx.order.count
        // adentro de la $transaction. Default 0 = primer uso del cupón.
        count:  vi.fn().mockResolvedValue(0),
      },
      commissionLedger: { create:     vi.fn().mockResolvedValue({}) },
      coupon: {
        update:     vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({ maxUses: 10, usedCount: 1 }),
      },
      customer: { updateMany: vi.fn().mockResolvedValue({}) },
    };
    await txArg(tx);
    expect(tx.coupon.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "coupon-1" }, data: { usedCount: { increment: 1 } } })
    );
  });

  it("cupón amount S/5 reduce total fijo (cap a subtotal si mayor)", async () => {
    // subtotal = 30 → discount = min(5, 30) = 5 → total = 25
    mockCouponFindFirst.mockResolvedValue({
      id: "coupon-2", discountType: "amount", discountValue: 5,
      maxUses: 0, usedCount: 0,
    });

    const result = await MarketplaceOrdersDB.createFromCart({
      ...COMMON_PARAMS,
      couponCode: "SOLES5",
    });

    expect(result.total).toBe(25);
  });

  it("cupón amount mayor al subtotal → total queda en 0 (cap)", async () => {
    // subtotal = 30 → discount = min(999, 30) = 30 → total = 0
    mockCouponFindFirst.mockResolvedValue({
      id: "coupon-3", discountType: "amount", discountValue: 999,
      maxUses: 0, usedCount: 0,
    });

    const result = await MarketplaceOrdersDB.createFromCart({
      ...COMMON_PARAMS,
      couponCode: "BIGDISCOUNT",
    });

    expect(result.total).toBe(0);
  });

  it("cupón maxUses=1 ya consumido → lanza 'Cupón ya alcanzó el límite de usos'", async () => {
    mockCouponFindFirst.mockResolvedValue({
      id: "coupon-4", discountType: "percent", discountValue: 10,
      maxUses: 1, usedCount: 1,
    });

    await expect(
      MarketplaceOrdersDB.createFromCart({ ...COMMON_PARAMS, couponCode: "USED" })
    ).rejects.toThrow("Cupón ya alcanzó el límite de usos");
  });

  it("race condition: usedCount > maxUses dentro de tx → lanza 'Cupón ya consumido'", async () => {
    mockCouponFindFirst.mockResolvedValue({
      id: "coupon-5", discountType: "percent", discountValue: 10,
      maxUses: 1, usedCount: 0,
    });

    // Simular que dentro de la tx la re-verificación detecta overflow
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        product: {
          findFirst:  vi.fn().mockResolvedValue({ stock: 10 }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        order:            {
        create: vi.fn().mockResolvedValue({}),
        // PENTEST Sprint A #2: nuevo check de TOCTOU usa tx.order.count
        // adentro de la $transaction. Default 0 = primer uso del cupón.
        count:  vi.fn().mockResolvedValue(0),
      },
        commissionLedger: { create:     vi.fn().mockResolvedValue({}) },
        coupon: {
          update:     vi.fn().mockResolvedValue({}),
          // usedCount=2 > maxUses=1 → race detectada
          findUnique: vi.fn().mockResolvedValue({ maxUses: 1, usedCount: 2 }),
        },
        customer: { updateMany: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    await expect(
      MarketplaceOrdersDB.createFromCart({ ...COMMON_PARAMS, couponCode: "RACE" })
    ).rejects.toThrow("Cupón ya consumido");
  });

  it("cupón expirado (coupon not found) → lanza 'Cupón inválido o expirado'", async () => {
    mockCouponFindFirst.mockResolvedValue(null);

    await expect(
      MarketplaceOrdersDB.createFromCart({ ...COMMON_PARAMS, couponCode: "EXPIRED" })
    ).rejects.toThrow("Cupón inválido o expirado");
  });
});

describe("MarketplaceOrdersDB.createFromCart — loyalty points", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreFindUnique.mockResolvedValue(STORE);
    mockStoreProductFindMany.mockResolvedValue([STORE_PRODUCT]);
    mockProductFindMany.mockResolvedValue([{ id: 42, stock: 100, name: "Arroz" }]);
    mockOrderCount.mockResolvedValue(0);
    mockCouponFindFirst.mockResolvedValue(null);
    successTx();
  });

  it("100 puntos → S/1 descuento y customer.updateMany llama decrement:100", async () => {
    // subtotal=30, loyalty = 100pts / 100 = 1 → total = 29
    mockCustomerFindFirst.mockResolvedValue({ phone: "999888777", loyaltyPoints: 200 });

    const result = await MarketplaceOrdersDB.createFromCart({
      ...COMMON_PARAMS,
      loyaltyRedeemPoints: 100,
    });

    expect(result.total).toBe(29);

    const txArg = mockTransaction.mock.calls[0][0];
    const tx = {
      product:          {
        findFirst:  vi.fn().mockResolvedValue({ stock: 10 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      order:            {
        create: vi.fn().mockResolvedValue({}),
        // PENTEST Sprint A #2: nuevo check de TOCTOU usa tx.order.count
        // adentro de la $transaction. Default 0 = primer uso del cupón.
        count:  vi.fn().mockResolvedValue(0),
      },
      commissionLedger: { create:     vi.fn().mockResolvedValue({}) },
      coupon:           { update: vi.fn(), findUnique: vi.fn() },
      customer:         { updateMany: vi.fn().mockResolvedValue({}) },
    };
    await txArg(tx);
    expect(tx.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phone: "999888777", tenantId: "tenant-1" },
        data:  { loyaltyPoints: { decrement: 100 } },
      })
    );
  });

  it("redimir > balance disponible → lanza 'Puntos de fidelidad insuficientes'", async () => {
    mockCustomerFindFirst.mockResolvedValue({ phone: "999888777", loyaltyPoints: 50 });

    await expect(
      MarketplaceOrdersDB.createFromCart({ ...COMMON_PARAMS, loyaltyRedeemPoints: 100 })
    ).rejects.toThrow("Puntos de fidelidad insuficientes");
  });

  it("customer no existe en este tenant → fidelidad insuficiente (null customer)", async () => {
    mockCustomerFindFirst.mockResolvedValue(null);

    await expect(
      MarketplaceOrdersDB.createFromCart({ ...COMMON_PARAMS, loyaltyRedeemPoints: 100 })
    ).rejects.toThrow("Puntos de fidelidad insuficientes");
  });
});
