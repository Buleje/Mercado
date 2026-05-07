/**
 * tier-discount.test.ts
 *
 * Cobertura: cálculo de tier discount filtrado por tenantId dentro de
 * MarketplaceOrdersDB.createFromCart y función exportada tierForCount.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Mocks Prisma ──────────────────────────────────────────────────────────────

const {
  mockStoreFindUnique,
  mockStoreProductFindMany,
  mockOrderCount,
  mockCustomerFindFirst,
  mockCustomerCreate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockStoreFindUnique:     vi.fn(),
  mockStoreProductFindMany: vi.fn(),
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
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/cache", () => ({
  getOrSet:          vi.fn((_k: string, _t: number, fn: () => unknown) => fn()),
  invalidateByPrefix: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { MarketplaceOrdersDB } from "@/lib/db/marketplace.db";
import { tierForCount } from "@/app/api/marketplace/customer-tier/route";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STORE_A = {
  id: "store-A", tenantId: "tenant-A", name: "Tienda A",
  slug: "tienda-a", isPublished: true, commission: 5,
};

const STORE_PRODUCT = {
  id: "sp-1", productId: 1, retailPrice: 10, minOrderQty: 1,
};

const CART_ITEM = {
  storeProductId: "sp-1", productId: 1, name: "Leche",
  quantity: 2, retailPrice: 10, unit: "l",
};

const COMMON_PARAMS = {
  storeSlug:       "tienda-a",
  customerName:    "Carlos",
  customerPhone:   "987654321",
  customerAddress: "Calle 1",
  items:           [CART_ITEM],
};

function successTx() {
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      product:          { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      order:            { create:     vi.fn().mockResolvedValue({}) },
      commissionLedger: { create:     vi.fn().mockResolvedValue({}) },
      coupon:           { update: vi.fn(), findUnique: vi.fn() },
      customer:         { updateMany: vi.fn().mockResolvedValue({}) },
    })
  );
}

// ── Tests: función pura tierForCount ─────────────────────────────────────────

describe("tierForCount — función pura", () => {
  it("0 pedidos → tier null", () => {
    expect(tierForCount(0)).toBeNull();
  });

  it("4 pedidos → tier null (justo debajo del umbral Frecuente)", () => {
    expect(tierForCount(4)).toBeNull();
  });

  it("5 pedidos → tier 'frecuente' con 5%", () => {
    const tier = tierForCount(5);
    expect(tier?.level).toBe("frecuente");
    expect(tier?.discountPct).toBe(5);
  });

  it("10 pedidos → tier 'vip' con 7%", () => {
    const tier = tierForCount(10);
    expect(tier?.level).toBe("vip");
    expect(tier?.discountPct).toBe(7);
  });

  it("25 pedidos → tier 'embajador' con 10%", () => {
    const tier = tierForCount(25);
    expect(tier?.level).toBe("embajador");
    expect(tier?.discountPct).toBe(10);
  });
});

// ── Tests: aislamiento por tenantId en createFromCart ────────────────────────

describe("tier discount en createFromCart — aislamiento tenantId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreFindUnique.mockResolvedValue(STORE_A);
    mockStoreProductFindMany.mockResolvedValue([STORE_PRODUCT]);
    mockCustomerFindFirst.mockResolvedValue({ phone: "987654321" });
    successTx();
  });

  it("5 pedidos entregados en tenant-A → 5% aplicado (subtotal 20 → total 19)", async () => {
    mockOrderCount.mockResolvedValue(5);

    const result = await MarketplaceOrdersDB.createFromCart(COMMON_PARAMS);

    // subtotal = 2 * 10 = 20, 5% tier = 1, total = 19
    expect(result.total).toBe(19);
  });

  it("0 pedidos entregados en tenant-A → sin descuento (total = subtotal)", async () => {
    mockOrderCount.mockResolvedValue(0);

    const result = await MarketplaceOrdersDB.createFromCart(COMMON_PARAMS);

    // subtotal = 20, sin tier, total = 20
    expect(result.total).toBe(20);
  });

  it("prisma.order.count recibe tenantId correcto (tenant-A, no tenant-B)", async () => {
    mockOrderCount.mockResolvedValue(0);

    await MarketplaceOrdersDB.createFromCart(COMMON_PARAMS);

    expect(mockOrderCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-A" }),
      })
    );
  });

  it("prisma.order.count filtra source=marketplace y status=entregado", async () => {
    mockOrderCount.mockResolvedValue(0);

    await MarketplaceOrdersDB.createFromCart(COMMON_PARAMS);

    const callArg = mockOrderCount.mock.calls[0][0];
    expect(callArg.where).toMatchObject({
      source: "marketplace",
      status: "entregado",
    });
  });

  it("10+ pedidos → 7% vip (subtotal 20 → total 18.60)", async () => {
    mockOrderCount.mockResolvedValue(10);

    const result = await MarketplaceOrdersDB.createFromCart(COMMON_PARAMS);

    // 7% de 20 = 1.4, total = 18.6
    expect(result.total).toBe(18.6);
  });

  it("25+ pedidos → 10% embajador (subtotal 20 → total 18)", async () => {
    mockOrderCount.mockResolvedValue(25);

    const result = await MarketplaceOrdersDB.createFromCart(COMMON_PARAMS);

    // 10% de 20 = 2, total = 18
    expect(result.total).toBe(18);
  });
});
