/**
 * orders-stock-decrement.test.ts
 *
 * Cobertura: stock atomic decrement dentro de createFromCart.
 * Verifica guards de stock insuficiente, deletedAt y cross-tenant.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Mocks Prisma ──────────────────────────────────────────────────────────────

const {
  mockStoreFindUnique,
  mockStoreProductFindMany,
  mockProductFindMany,
  mockOrderCount,
  mockCustomerFindFirst,
  mockCustomerCreate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockStoreFindUnique:     vi.fn(),
  mockStoreProductFindMany: vi.fn(),
  mockProductFindMany:     vi.fn(),
  mockOrderCount:          vi.fn(),
  mockCustomerFindFirst:   vi.fn(),
  mockCustomerCreate:      vi.fn(),
  mockTransaction:         vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    store:        { findUnique: mockStoreFindUnique },
    storeProduct: { findMany: mockStoreProductFindMany },
    order:        { count: mockOrderCount },
    customer:     { findFirst: mockCustomerFindFirst, create: mockCustomerCreate },
    coupon:       { findFirst: vi.fn().mockResolvedValue(null) },
    product:      { findMany: mockProductFindMany },
    // P0-1 fix (audit 2026-05-23): CommissionsDB.computeVendorTier requiere
    // prisma.commissionLedger.findMany. Mock vacío → tier base.
    commissionLedger: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  getOrSet:          vi.fn((_k: string, _t: number, fn: () => unknown) => fn()),
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
  id: "sp-1", productId: 10, retailPrice: 5, minOrderQty: 1,
};

const CART_ITEM = {
  storeProductId: "sp-1", productId: 10, name: "Azúcar",
  quantity: 3, retailPrice: 5, unit: "kg",
};

const COMMON_PARAMS = {
  storeSlug:       "bodega-test",
  customerName:    "María",
  customerPhone:   "912345678",
  customerAddress: "Av. Lima 456",
  items:           [CART_ITEM],
};

/**
 * Crea una transacción con el comportamiento indicado para product.updateMany.
 * count=1 → éxito (stock suficiente)
 * count=0 → stock insuficiente (lanza Error)
 *
 * product.findFirst retorna { stock: 10 } para que pase el guard `current.stock < item.quantity`.
 * Si updateMany retorna count=0 se lanza el error de race condition.
 */
function makeTx(updateManyCount: number) {
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const mockProductUpdateMany = vi.fn().mockResolvedValue({ count: updateManyCount });
    const tx = {
      product:          {
        findFirst:  vi.fn().mockResolvedValue({ stock: 10 }),
        updateMany: mockProductUpdateMany,
      },
      order:            { create:     vi.fn().mockResolvedValue({}) },
      commissionLedger: { create:     vi.fn().mockResolvedValue({}) },
      coupon:           { update: vi.fn(), findUnique: vi.fn() },
      customer:         { updateMany: vi.fn().mockResolvedValue({}) },
    };
    return fn(tx);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MarketplaceOrdersDB.createFromCart — stock decrement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreFindUnique.mockResolvedValue(STORE);
    mockStoreProductFindMany.mockResolvedValue([STORE_PRODUCT]);
    // Pre-tx stockSnapshot batch (2026-05-19 N+1 fix)
    mockProductFindMany.mockResolvedValue([{ id: 10, stock: 10, name: "Azúcar" }]);
    mockOrderCount.mockResolvedValue(0);
    mockCustomerFindFirst.mockResolvedValue({ phone: "912345678" });
  });

  it("stock 10, qty 3 → updateMany count=1, pedido creado exitosamente", async () => {
    makeTx(1); // count=1 → updateMany exitoso

    const result = await MarketplaceOrdersDB.createFromCart(COMMON_PARAMS);

    expect(result.id).toBeDefined();
    expect(result.status).toBe("pendiente");

    // Verificar que la tx se ejecutó con el decrement correcto
    const txArg = mockTransaction.mock.calls[0][0];
    const mockProductUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const captureTx = {
      product: {
        findFirst:  vi.fn().mockResolvedValue({ stock: 10 }),
        updateMany: mockProductUpdateMany,
      },
      order:            { create: vi.fn().mockResolvedValue({}) },
      commissionLedger: { create: vi.fn().mockResolvedValue({}) },
      coupon:           { update: vi.fn(), findUnique: vi.fn() },
      customer:         { updateMany: vi.fn().mockResolvedValue({}) },
    };
    await txArg(captureTx);
    expect(mockProductUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { stock: { decrement: 3 } },
      })
    );
  });

  it("stock insuficiente (updateMany count=0) → lanza 'Stock insuficiente para Azúcar'", async () => {
    makeTx(0); // count=0 → stock guard activa

    await expect(
      MarketplaceOrdersDB.createFromCart(COMMON_PARAMS)
    ).rejects.toThrow("Stock insuficiente para Azúcar");
  });

  it("el where de product.updateMany incluye tenantId para evitar cross-tenant", async () => {
    makeTx(1);

    const txArg = mockTransaction.mock.calls[0]?.[0];
    if (!txArg) {
      // Si la tx aún no fue llamada, ejecutar createFromCart primero
      await MarketplaceOrdersDB.createFromCart(COMMON_PARAMS).catch(() => null);
    }

    // Capturar el call del updateMany dentro de la tx
    const capturedCalls: unknown[] = [];
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const mockProductUpdateMany = vi.fn().mockImplementation((args: unknown) => {
        capturedCalls.push(args);
        return Promise.resolve({ count: 1 });
      });
      const tx = {
        product:          {
          findFirst:  vi.fn().mockResolvedValue({ stock: 10 }),
          updateMany: mockProductUpdateMany,
        },
        order:            { create: vi.fn().mockResolvedValue({}) },
        commissionLedger: { create: vi.fn().mockResolvedValue({}) },
        coupon:           { update: vi.fn(), findUnique: vi.fn() },
        customer:         { updateMany: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    await MarketplaceOrdersDB.createFromCart(COMMON_PARAMS);

    expect(capturedCalls.length).toBeGreaterThan(0);
    const updateArg = capturedCalls[0] as { where: Record<string, unknown> };
    expect(updateArg.where).toMatchObject({ tenantId: "tenant-1" });
  });

  it("el where de product.updateMany incluye stock >= qty solicitada", async () => {
    const capturedCalls: unknown[] = [];
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const mockProductUpdateMany = vi.fn().mockImplementation((args: unknown) => {
        capturedCalls.push(args);
        return Promise.resolve({ count: 1 });
      });
      const tx = {
        product:          {
          findFirst:  vi.fn().mockResolvedValue({ stock: 10 }),
          updateMany: mockProductUpdateMany,
        },
        order:            { create: vi.fn().mockResolvedValue({}) },
        commissionLedger: { create: vi.fn().mockResolvedValue({}) },
        coupon:           { update: vi.fn(), findUnique: vi.fn() },
        customer:         { updateMany: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    await MarketplaceOrdersDB.createFromCart(COMMON_PARAMS);

    const updateArg = capturedCalls[0] as { where: Record<string, unknown> };
    // stock: { gte: 3 } para la qty=3
    expect(updateArg.where).toMatchObject({ stock: { gte: 3 } });
  });

  it("el where de product.updateMany incluye deletedAt: null (no productos eliminados)", async () => {
    const capturedCalls: unknown[] = [];
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const mockProductUpdateMany = vi.fn().mockImplementation((args: unknown) => {
        capturedCalls.push(args);
        return Promise.resolve({ count: 1 });
      });
      const tx = {
        product: {
          findFirst:  vi.fn().mockResolvedValue({ stock: 10 }),
          updateMany: mockProductUpdateMany,
        },
        order:            { create: vi.fn().mockResolvedValue({}) },
        commissionLedger: { create: vi.fn().mockResolvedValue({}) },
        coupon:           { update: vi.fn(), findUnique: vi.fn() },
        customer:         { updateMany: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    await MarketplaceOrdersDB.createFromCart(COMMON_PARAMS);

    const updateArg = capturedCalls[0] as { where: Record<string, unknown> };
    expect(updateArg.where).toMatchObject({ deletedAt: null });
  });

  it("producto de otro tenant → storeProduct.findMany no lo retorna → error 'no disponibles'", async () => {
    // storeProduct.findMany devuelve [] porque el producto no pertenece a esta tienda
    mockStoreProductFindMany.mockResolvedValue([]);

    await expect(
      MarketplaceOrdersDB.createFromCart(COMMON_PARAMS)
    ).rejects.toThrow(/no están disponibles/);
  });
});
