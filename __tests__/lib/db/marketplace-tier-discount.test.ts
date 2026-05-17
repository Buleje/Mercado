/**
 * TEST B3 — tierDiscountFailed flag + findOrdersWithFailedTierDiscount
 *
 * Verifica que cuando prisma.order.count falla:
 *  1. El order se crea igualmente (checkout no bloqueado)
 *  2. notes contiene [TIER_DISCOUNT_FAILED:...]
 *  3. findOrdersWithFailedTierDiscount retorna esos orders scoped por tenantId
 *  4. Aislamiento multi-tenant correcto
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Logger mock ───────────────────────────────────────────────────────────────

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  },
}));

// ── Cache helpers — no-op ─────────────────────────────────────────────────────

vi.mock("@/lib/cache", () => ({
  getOrSet:           vi.fn((_k: string, _t: number, fn: () => unknown) => fn()),
  invalidate:         vi.fn(),
  invalidateByPrefix: vi.fn(),
  cacheStore:         { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));

// ── Prisma mock ───────────────────────────────────────────────────────────────

const mockOrderCount        = vi.hoisted(() => vi.fn());
const mockOrderFindMany     = vi.hoisted(() => vi.fn());
const mockCustomerFindFirst = vi.hoisted(() => vi.fn());
const mockCustomerCreate    = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockCouponFindFirst   = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockStoreFindUnique   = vi.hoisted(() => vi.fn());
const mockStoreProductFind  = vi.hoisted(() => vi.fn());
const mockTransaction       = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    store:         { findUnique: mockStoreFindUnique, findFirst: vi.fn() },
    storeProduct:  { findMany: mockStoreProductFind, count: vi.fn().mockResolvedValue(0) },
    order:         { count: mockOrderCount, findMany: mockOrderFindMany, create: vi.fn().mockResolvedValue({}) },
    customer:      { findFirst: mockCustomerFindFirst, create: mockCustomerCreate },
    coupon:        { findFirst: mockCouponFindFirst },
    loyaltyPoints: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue(null) },
    product:       { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction:  mockTransaction,
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STORE_TENANT = "store-tenant-001";
const ALT_TENANT   = "store-tenant-002";

function makeStore(tenantId: string) {
  return {
    id:          `store-${tenantId}`,
    tenantId,
    name:        "Bodega Test",
    slug:        "bodega-test",
    isPublished: true,
    commission:  5,
  };
}

// storeProduct con campos reales que usa createFromCart (retailPrice, minOrderQty)
const storeProduct = {
  id:          "sp-1",
  productId:   1,
  retailPrice: 10,
  minOrderQty: 1,
};

// CartItem con tipo real: productId es number, retailPrice requerido
function baseParams(phone = "999111222") {
  return {
    storeSlug:       "bodega-test",
    items:           [{
      storeProductId: "sp-1",
      productId:      1,
      name:           "Arroz 1kg",
      quantity:       2,
      retailPrice:    10,
      unit:           "unidad",
    }],
    customerName:    "Maria Lopez",
    customerPhone:   phone,
    customerAddress: "Jr. Lima 123",
    notes:           undefined as string | undefined,
    couponCode:      undefined as string | undefined,
    loyaltyRedeemPoints: 0,
  };
}

// Construye el tx fake y captura el notes del order.create
function setupTransaction(capturedNotes: Array<string | null>) {
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    let capturedThisCall: string | null = null;
    const tx = {
      product: {
        findFirst:  vi.fn().mockResolvedValue({ stock: 10 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        create: (data: { data: { notes?: string | null } }) => {
          capturedThisCall = data.data.notes ?? null;
          capturedNotes.push(capturedThisCall);
          return Promise.resolve({});
        },
      },
      commissionLedger: {
        create: vi.fn().mockResolvedValue({}),
      },
      coupon: {
        update:     vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      customer: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst:  vi.fn().mockResolvedValue(null),
      },
    };
    await fn(tx);
  });
}

// ── Import modulo bajo test (top-level await — Vitest soporta ESM) ────────────

const { MarketplaceOrdersDB } = await import("@/lib/db/marketplace/orders.db");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("B3 — tierDiscountFailed tag en Order.notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomerFindFirst.mockResolvedValue(null);
    mockCustomerCreate.mockResolvedValue({});
    mockCouponFindFirst.mockResolvedValue(null);
  });

  // ── 1: count falla → notes contiene TIER_DISCOUNT_FAILED ─────────────────

  it("cuando order.count lanza, notes incluye TIER_DISCOUNT_FAILED", async () => {
    mockStoreFindUnique.mockResolvedValue(makeStore(STORE_TENANT));
    mockStoreProductFind.mockResolvedValue([storeProduct]);
    mockOrderCount.mockRejectedValue(new Error("DB connection lost"));

    const capturedNotes: Array<string | null> = [];
    setupTransaction(capturedNotes);

    await MarketplaceOrdersDB.createFromCart(baseParams());

    expect(capturedNotes[0]).toContain("TIER_DISCOUNT_FAILED");
  });

  // ── 2: count ok → notes NO contiene TIER_DISCOUNT_FAILED ─────────────────

  it("cuando order.count tiene exito, notes NO incluye TIER_DISCOUNT_FAILED", async () => {
    mockStoreFindUnique.mockResolvedValue(makeStore(STORE_TENANT));
    mockStoreProductFind.mockResolvedValue([storeProduct]);
    mockOrderCount.mockResolvedValue(3); // < 5 → sin tier discount, sin error

    const capturedNotes: Array<string | null> = [];
    setupTransaction(capturedNotes);

    await MarketplaceOrdersDB.createFromCart(baseParams());

    const notes = capturedNotes[0] ?? "";
    expect(notes).not.toContain("TIER_DISCOUNT_FAILED");
  });

  // ── 3: findOrdersWithFailedTierDiscount retorna orders con el tag ─────────

  it("findOrdersWithFailedTierDiscount retorna orders con TIER_DISCOUNT_FAILED", async () => {
    const failedOrders = [
      {
        id:            "MKT-FAIL001",
        customerPhone: "999111222",
        total:         25.50,
        createdAt:     new Date("2026-05-01"),
      },
    ];
    mockOrderFindMany.mockResolvedValue(failedOrders);

    const result = await MarketplaceOrdersDB.findOrdersWithFailedTierDiscount(STORE_TENANT);

    expect(mockOrderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: STORE_TENANT,
          OR: expect.arrayContaining([
            expect.objectContaining({ notes: expect.objectContaining({ contains: "TIER_DISCOUNT_FAILED" }) }),
          ]),
        }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("MKT-FAIL001");
    expect(typeof result[0].total).toBe("number");
  });

  // ── 4: multi-tenant isolation ─────────────────────────────────────────────

  it("findOrdersWithFailedTierDiscount no mezcla tenants — solo el tenantId indicado", async () => {
    mockOrderFindMany.mockResolvedValue([]);

    await MarketplaceOrdersDB.findOrdersWithFailedTierDiscount(ALT_TENANT);

    const query = mockOrderFindMany.mock.calls[0][0] as { where: { tenantId: string } };
    expect(query.where.tenantId).toBe(ALT_TENANT);
    expect(query.where.tenantId).not.toBe(STORE_TENANT);
  });

  // ── 5: dos clientes distintos, count falla en ambos ───────────────────────

  it("dos customers distintos con count fallando — ambos orders marcados con el tag", async () => {
    mockStoreFindUnique.mockResolvedValue(makeStore(STORE_TENANT));
    mockStoreProductFind.mockResolvedValue([storeProduct]);
    mockOrderCount.mockRejectedValue(new Error("timeout"));

    const capturedNotes: Array<string | null> = [];
    setupTransaction(capturedNotes);

    await MarketplaceOrdersDB.createFromCart(baseParams("999111000"));
    await MarketplaceOrdersDB.createFromCart(baseParams("999222000"));

    expect(capturedNotes).toHaveLength(2);
    for (const notes of capturedNotes) {
      expect(notes).toContain("TIER_DISCOUNT_FAILED");
    }
  });

  // ── 6: findOrdersWithFailedTierDiscount filtra source=marketplace ─────────

  it("findOrdersWithFailedTierDiscount filtra source=marketplace", async () => {
    mockOrderFindMany.mockResolvedValue([]);

    await MarketplaceOrdersDB.findOrdersWithFailedTierDiscount(STORE_TENANT);

    const query = mockOrderFindMany.mock.calls[0][0] as { where: { source: string } };
    expect(query.where.source).toBe("marketplace");
  });

  // ── 7: order anónimo (phone null/vacío) recibe tag ANONYMOUS_NO_TIER ────────
  // FIX 2026-05-09: verifica que pedidos sin phone quedan taguados para audit.

  it("order con customerPhone vacío recibe tag ANONYMOUS_NO_TIER en notes", async () => {
    mockStoreFindUnique.mockResolvedValue(makeStore(STORE_TENANT));
    mockStoreProductFind.mockResolvedValue([storeProduct]);
    mockOrderCount.mockResolvedValue(0);

    const capturedNotes: Array<string | null> = [];
    setupTransaction(capturedNotes);

    // phone vacío = falsy → branch `if (params.customerPhone)` no ejecuta
    const paramsAnon = { ...baseParams(""), customerPhone: "" };
    await MarketplaceOrdersDB.createFromCart(paramsAnon);

    expect(capturedNotes[0]).toContain("ANONYMOUS_NO_TIER");
    expect(capturedNotes[0]).not.toContain("TIER_DISCOUNT_FAILED");
    // order.count NO debe llamarse para pedidos anónimos
    expect(mockOrderCount).not.toHaveBeenCalled();
  });

  // ── 8: findOrdersWithFailedTierDiscount incluye ANONYMOUS_NO_TIER via OR ────

  it("findOrdersWithFailedTierDiscount retorna orders con ANONYMOUS_NO_TIER via OR", async () => {
    const anonymousOrders = [
      {
        id:            "MKT-ANON001",
        customerPhone: null,
        total:         18.0,
        createdAt:     new Date("2026-05-09"),
        notes:         "[ANONYMOUS_NO_TIER: pedido sin teléfono, tier discount no aplica]",
      },
    ];
    mockOrderFindMany.mockResolvedValue(anonymousOrders);

    const result = await MarketplaceOrdersDB.findOrdersWithFailedTierDiscount(STORE_TENANT);

    const query = mockOrderFindMany.mock.calls[0][0] as {
      where: { OR: Array<{ notes: { contains: string } }> };
    };
    expect(query.where.OR).toHaveLength(2);
    expect(query.where.OR[0].notes.contains).toBe("TIER_DISCOUNT_FAILED");
    expect(query.where.OR[1].notes.contains).toBe("ANONYMOUS_NO_TIER");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("MKT-ANON001");
    expect(result[0].tierAuditTag).toBe("ANONYMOUS_NO_TIER");
    expect(result[0].customerPhone).toBeNull();
  });
});
