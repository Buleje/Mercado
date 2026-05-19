/**
 * RED-005 (stock oversell race) + RED-006 (coupon double-use race) +
 * RED-007 (cross-tenant coupon) regression suite for `app/api/orders/route.ts`.
 *
 * Each test simulates the second of two parallel POSTs by mocking the
 * conditional `$executeRaw` UPDATE to return rowsAffected=0, exactly as
 * PostgreSQL would for a caller that lost the race.
 *
 * Exploits covered:
 *   (a) RED-005: 2 parallel POSTs for the last unit → 1 succeeds (201),
 *       1 fails (409 insufficient_stock).
 *   (b) RED-006: 2 parallel POSTs with a maxUses=1 coupon → 1 succeeds,
 *       1 fails (409 coupon_exhausted).
 *   (c) RED-007: tenant B tries to use a coupon owned by tenant A →
 *       getByCode is scoped by tenantId and returns null → no discount,
 *       no redemption, order goes through at full price (or 400 in stricter
 *       configs). Either way, tenant A's coupon counter is NOT bumped.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Infrastructure mocks ───────────────────────────────────────────────────
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/resolve-tenant", () => ({
  resolveTenantSlug: vi.fn(async (slug: string) => slug),
  resolveTenantSlugToId: vi.fn(async (slug: string) => slug),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/sse-emitter", () => ({ emitAdminSSE: vi.fn() }));

vi.mock("@/lib/mailer", () => ({
  sendOrderNotification: vi.fn(async () => {}),
}));

vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppNotification: vi.fn(async () => {}),
  getWhatsAppLink: vi.fn(() => "https://wa.me/fake"),
  sendWhatsAppText: vi.fn(async () => {}),
  sendWhatsAppQueued: vi.fn(async () => ({ queued: true })),
}));

vi.mock("@/lib/receipt-whatsapp", () => ({
  sendReceiptByWhatsApp: vi.fn(async () => {}),
}));

vi.mock("@/lib/push-sender", () => ({
  sendPushToPhone: vi.fn(async () => {}),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(async () => {}),
}));

vi.mock("@/lib/plans", () => ({
  getPlanLimits: vi.fn(() => ({ maxOrdersPerMonth: -1 })),
  withinLimit: vi.fn((current: number, max: number) => max === -1 || current < max),
  planLimitPayload: vi.fn(() => ({ error: "plan_limit" })),
}));

vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));

vi.mock("@/lib/db-retry", () => ({
  withDbRetry: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
}));

vi.mock("@/lib/db/inventory.db", () => ({
  InventoryMovementsDB: { decrementFEFO: vi.fn(async () => {}) },
}));

vi.mock("@/lib/pricing/discount-strategies", () => ({
  createDefaultDiscountEngine: vi.fn(() => ({
    apply: vi.fn(() => ({ bestDiscount: null, allResults: [] })),
  })),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(),
}));

// ─── jsondb mocks (OrdersDB / CouponsDB / PromotionsDB) ─────────────────────
// NOTE: every mock is widened to `unknown`-returning so per-test overrides
// (mockResolvedValue, mockImplementation) accept any shape without TS errors.
const {
  mockOrdersAdd,
  mockOrdersGetByCustomerPhone,
  mockCouponsGetByCode,
  mockCouponsRedeem,
  mockCouponsAdd,
  mockPromotionsGetAll,
} = vi.hoisted(() => ({
  mockOrdersAdd: vi.fn() as ReturnType<typeof vi.fn>,
  mockOrdersGetByCustomerPhone: vi.fn() as ReturnType<typeof vi.fn>,
  mockCouponsGetByCode: vi.fn() as ReturnType<typeof vi.fn>,
  mockCouponsRedeem: vi.fn() as ReturnType<typeof vi.fn>,
  mockCouponsAdd: vi.fn() as ReturnType<typeof vi.fn>,
  mockPromotionsGetAll: vi.fn() as ReturnType<typeof vi.fn>,
}));

vi.mock("@/lib/jsondb", () => ({
  OrdersDB: {
    add: mockOrdersAdd,
    getAll: vi.fn(),
    getPage: vi.fn(),
    getAllFiltered: vi.fn(),
    getByCustomerPhone: mockOrdersGetByCustomerPhone,
  },
  CouponsDB: {
    getByCode: mockCouponsGetByCode,
    redeem: mockCouponsRedeem,
    add: mockCouponsAdd,
  },
  PromotionsDB: {
    getAll: mockPromotionsGetAll,
  },
}));

// ─── prisma mocks ───────────────────────────────────────────────────────────
const {
  mockOrderFindFirst,
  mockTenantFindFirst,
  mockProductFindMany,
  mockOrderCount,
  mockCustomerFindUnique,
  mockCustomerNotifCreate,
  mockExecuteRaw,
  mockTransaction,
} = vi.hoisted(() => ({
  mockOrderFindFirst: vi.fn(),
  mockTenantFindFirst: vi.fn(),
  mockProductFindMany: vi.fn(),
  mockOrderCount: vi.fn(),
  mockCustomerFindUnique: vi.fn(),
  mockCustomerNotifCreate: vi.fn(async () => {}),
  mockExecuteRaw: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const prismaMock = {
    order: {
      findFirst: mockOrderFindFirst,
      count: mockOrderCount,
    },
    tenant: {
      findFirst: mockTenantFindFirst,
      findUnique: vi.fn().mockResolvedValue(null),
    },
    product: {
      findMany: mockProductFindMany,
    },
    customer: {
      findUnique: mockCustomerFindUnique,
    },
    customerNotification: {
      create: mockCustomerNotifCreate,
    },
    $executeRaw: mockExecuteRaw,
    $transaction: mockTransaction,
  };
  return { prisma: prismaMock };
});

// ─── Mock: @/lib/tenant — prismaForTenant returns the same mock client ───────
// The route calls prismaForTenant(tenantId).model.method(...). We intercept at
// the tenant layer so mockTransaction / mockExecuteRaw (overridden per-test in
// beforeEach) are the same handles the route actually calls. Critical for
// RED-005/RED-006 race-condition assertions.
vi.mock("@/lib/tenant", () => ({
  prismaForTenant: vi.fn(() => ({
    order: {
      findFirst: mockOrderFindFirst,
      count:     mockOrderCount,
    },
    tenant: {
      findFirst:  mockTenantFindFirst,
      findUnique: vi.fn().mockResolvedValue(null),
    },
    product: {
      findMany: mockProductFindMany,
    },
    customer: {
      findUnique: mockCustomerFindUnique,
    },
    customerNotification: {
      create: mockCustomerNotifCreate,
    },
    $executeRaw: mockExecuteRaw,
    $transaction: mockTransaction,
  })),
}));

// ─── Import handler AFTER all mocks are set ─────────────────────────────────
import { POST } from "@/app/api/orders/route";

// ─── Helpers ────────────────────────────────────────────────────────────────
const defaultCtx = { params: Promise.resolve({}) };

function makePostReq(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("https://host/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Minimal Prisma.Decimal shape that `toNumOrZero` understands. */
function dec(n: number) {
  return {
    toNumber: () => n,
    toFixed: (d = 2) => n.toFixed(d),
    toString: () => String(n),
  };
}

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

// ─── Suite ──────────────────────────────────────────────────────────────────
describe("POST /api/orders — RED-005 + RED-006 + RED-007 race conditions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockOrderFindFirst.mockResolvedValue(null);
    mockOrderCount.mockResolvedValue(0);
    mockTenantFindFirst.mockResolvedValue({ plan: "free" });
    mockProductFindMany.mockResolvedValue([]);
    mockCustomerFindUnique.mockResolvedValue(null);
    mockCustomerNotifCreate.mockResolvedValue(undefined);
    mockOrdersGetByCustomerPhone.mockResolvedValue([]);

    mockOrdersAdd.mockImplementation(
      async (order: Record<string, unknown>, _tenant: string) => ({
        ...order,
        id: `saved-${Math.random().toString(36).slice(2, 8)}`,
      }),
    );

    // Default $transaction: invoke the callback with a tx whose $executeRaw
    // mirrors mockExecuteRaw. Tests override per-case.
    mockTransaction.mockImplementation(async (fn: unknown) => {
      const callback = fn as (tx: { $executeRaw: typeof mockExecuteRaw }) => Promise<unknown>;
      return callback({ $executeRaw: mockExecuteRaw });
    });

    // Default $executeRaw: 1 row affected (the happy path).
    mockExecuteRaw.mockResolvedValue(1);
  });

  // ── (a) RED-005: stock oversell race ────────────────────────────────────
  it("RED-005: rejects 409 insufficient_stock when the conditional UPDATE matches 0 rows", async () => {
    // The catalog says product 1 exists with stock=1. The first parallel POST
    // already drained it via the atomic guard, so the UPDATE in this request
    // matches 0 rows.
    mockProductFindMany.mockResolvedValue([
      { id: 1, price: dec(10), costPrice: dec(6), stock: 1 },
    ]);
    mockExecuteRaw.mockResolvedValueOnce(0); // first stock guard → race lost

    const req = makePostReq(
      {
        customer: { name: "Alice" },
        items: [{ id: 1, name: "Pan", price: 10, quantity: 1 }],
        total: 10,
      },
      { "x-tenant-id": TENANT_A },
    );

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("insufficient_stock");
    expect(body.productId).toBe(1);
    expect(mockOrdersAdd).not.toHaveBeenCalled();
  });

  it("RED-005: succeeds (201) when the atomic UPDATE matches 1 row (race winner)", async () => {
    mockProductFindMany.mockResolvedValue([
      { id: 1, price: dec(10), costPrice: dec(6), stock: 1 },
    ]);
    mockExecuteRaw.mockResolvedValue(1); // every guard wins

    const req = makePostReq(
      {
        customer: { name: "Bob" },
        items: [{ id: 1, name: "Pan", price: 10, quantity: 1 }],
        total: 10,
      },
      { "x-tenant-id": TENANT_A },
    );

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(201);
    expect(mockOrdersAdd).toHaveBeenCalledTimes(1);
  });

  it("RED-005: skips the atomic decrement for products with stock=null (unlimited)", async () => {
    mockProductFindMany.mockResolvedValue([
      { id: 1, price: dec(10), costPrice: dec(6), stock: null },
    ]);
    // No UPDATE should run for this item — but if one did, force it to fail
    // to make the assertion sharp.
    mockExecuteRaw.mockResolvedValue(0);

    const req = makePostReq(
      {
        customer: { name: "Carol" },
        items: [{ id: 1, name: "Servicio", price: 10, quantity: 99 }],
        total: 990,
      },
      { "x-tenant-id": TENANT_A },
    );

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(201);
    expect(mockOrdersAdd).toHaveBeenCalledTimes(1);
    // No stock guard fired (no executeRaw inside the txn for this item, no
    // coupon either) → mockExecuteRaw stayed untouched.
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  // ── (b) RED-006: coupon double-use race ─────────────────────────────────
  it("RED-006: rejects 409 coupon_exhausted when the coupon UPDATE matches 0 rows", async () => {
    mockProductFindMany.mockResolvedValue([
      { id: 1, price: dec(20), costPrice: dec(12), stock: 100 },
    ]);
    // Coupon validation passes (the lookup happens BEFORE the atomic txn) —
    // the race happens at redemption time, modeled by 0-rows on the second
    // executeRaw call (stock UPDATE wins, coupon UPDATE loses).
    mockCouponsGetByCode.mockResolvedValue({
      id: "c1",
      code: "ONCE",
      description: "",
      discountType: "percent",
      discountValue: 10,
      maxUses: 1,
      usedCount: 0,
      active: true,
      createdAt: "2026-01-01T00:00:00Z",
    });
    mockExecuteRaw
      .mockResolvedValueOnce(1) // stock decrement wins
      .mockResolvedValueOnce(0); // coupon redeem loses the race

    const req = makePostReq(
      {
        customer: { name: "Dan" },
        items: [{ id: 1, name: "Whisky", price: 20, quantity: 1 }],
        total: 18,
        appliedCouponCode: "ONCE",
      },
      { "x-tenant-id": TENANT_A },
    );

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("coupon_exhausted");
    expect(body.couponCode).toBe("ONCE");
    expect(mockOrdersAdd).not.toHaveBeenCalled();
  });

  it("RED-006: passes the conditional coupon UPDATE on the happy path", async () => {
    mockProductFindMany.mockResolvedValue([
      { id: 1, price: dec(20), costPrice: dec(12), stock: 100 },
    ]);
    mockCouponsGetByCode.mockResolvedValue({
      id: "c1",
      code: "ONCE",
      description: "",
      discountType: "percent",
      discountValue: 10,
      maxUses: 1,
      usedCount: 0,
      active: true,
      createdAt: "2026-01-01T00:00:00Z",
    });
    mockExecuteRaw.mockResolvedValue(1);

    const req = makePostReq(
      {
        customer: { name: "Eve" },
        items: [{ id: 1, name: "Whisky", price: 20, quantity: 1 }],
        total: 18,
        appliedCouponCode: "ONCE",
      },
      { "x-tenant-id": TENANT_A },
    );

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(201);
    expect(mockOrdersAdd).toHaveBeenCalledTimes(1);
    // The lookup MUST be tenant-scoped (RED-007 enforced at the call site).
    expect(mockCouponsGetByCode).toHaveBeenCalledWith(TENANT_A, "ONCE");
  });

  // ── (c) RED-007: cross-tenant coupon ────────────────────────────────────
  it("RED-007: tenant B's getByCode call is scoped by tenantId and returns null for tenant A's coupon", async () => {
    mockProductFindMany.mockResolvedValue([
      { id: 1, price: dec(20), costPrice: dec(12), stock: 100 },
    ]);
    // Simulate the DB: TENANT-A-COUPON exists for tenant A, NOT for tenant B.
    mockCouponsGetByCode.mockImplementation(
      async (...args: unknown[]) => {
        // New secure form: (tenantId, code)
        if (args.length === 2) {
          const [tid, code] = args as [string, string];
          if (tid === TENANT_A && code === "TENANT-A-COUPON") {
            return {
              id: "ca1",
              code: "TENANT-A-COUPON",
              description: "",
              discountType: "percent" as const,
              discountValue: 10,
              maxUses: 100,
              usedCount: 0,
              active: true,
              createdAt: "2026-01-01T00:00:00Z",
            };
          }
          return null;
        }
        // Legacy form (should never be reached from the orders route now).
        return null;
      },
    );
    mockExecuteRaw.mockResolvedValue(1);

    // audit P0 #1 (2026-05-18): enviamos el total real (20, full price) en
    // vez de 18 con descuento — el foco del test queda en el coupon
    // scoping. El gate de total mismatch (P0 #1) habría rechazado 18.
    const req = makePostReq(
      {
        customer: { name: "Mallory" },
        items: [{ id: 1, name: "Whisky", price: 20, quantity: 1 }],
        total: 20,
        appliedCouponCode: "TENANT-A-COUPON",
      },
      { "x-tenant-id": TENANT_B }, // tenant B trying to steal tenant A's coupon
    );

    const res = await POST(req, defaultCtx);
    // Order still creates — but at full price (no discount applied).
    expect(res.status).toBe(201);
    const body = await res.json();
    // Crucially: no coupon was attached to the order.
    expect(body.appliedCouponCode).toBeUndefined();
    expect(body.couponDiscount).toBeUndefined();
    expect(body.total).toBe(20); // full price, no discount

    // The lookup ran with tenant B's tenantId, not tenant A's.
    expect(mockCouponsGetByCode).toHaveBeenCalledWith(TENANT_B, "TENANT-A-COUPON");

    // No coupon UPDATE ran inside the transaction (because verifiedCouponCode
    // was never set). Stock UPDATE was the only $executeRaw call.
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });
});
