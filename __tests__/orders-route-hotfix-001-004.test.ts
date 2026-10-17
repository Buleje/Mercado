/**
 * HOTFIX-001 (price manipulation) + HOTFIX-004 (cross-tenant idempotency)
 * Regression suite for `app/api/orders/route.ts` POST handler.
 *
 * Exploits covered:
 *   (a) Client sends items[i].price = 0.01 for a product whose DB price is
 *       S/50.00. Server MUST persist the DB price, not the client value.
 *   (b) Client sends a fake/deleted productId. Server MUST reject with
 *       400 { error: "invalid_product" }.
 *   (c) Same tenant replays the same idempotency key — server returns the
 *       already-created order (200, no new write).
 *   (d) Tenant B sends a DIFFERENT order with tenant A's idempotency key.
 *       Server MUST create a brand-new order for tenant B (no cross-tenant
 *       key collision — tenant A's order is never returned to tenant B).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Infrastructure mocks ───────────────────────────────────────────────────
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/resolve-tenant", () => ({
  // Identity mock: whatever header the client sends becomes the tenantId.
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
  revalidateTenantTag: vi.fn(),
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
const {
  mockOrdersAdd,
  mockOrdersGetByCustomerPhone,
  mockCouponsGetByCode,
  mockCouponsRedeem,
  mockCouponsAdd,
  mockPromotionsGetAll,
} = vi.hoisted(() => ({
  mockOrdersAdd: vi.fn(),
  mockOrdersGetByCustomerPhone: vi.fn(async () => []),
  mockCouponsGetByCode: vi.fn(async () => null),
  mockCouponsRedeem: vi.fn(async () => {}),
  mockCouponsAdd: vi.fn(async () => {}),
  mockPromotionsGetAll: vi.fn(async () => []),
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
} = vi.hoisted(() => ({
  mockOrderFindFirst: vi.fn(),
  mockTenantFindFirst: vi.fn(),
  mockProductFindMany: vi.fn(),
  mockOrderCount: vi.fn(),
  mockCustomerFindUnique: vi.fn(),
  mockCustomerNotifCreate: vi.fn(async () => {}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
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
      // Round 8: handler usa findFirst tras refactor checkout (74603411). Reusar mismo mock.
      findFirst:  mockCustomerFindUnique,
    },
    customerNotification: {
      create: mockCustomerNotifCreate,
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txProxy = {
        $executeRaw: vi.fn(async () => 1),
      };
      return fn(txProxy);
    }),
  },
}));

// ─── Mock: @/lib/tenant — prismaForTenant returns the same mock client ───────
// The route calls prismaForTenant(tenantId).model.method(...) — we intercept
// here so the hoisted mock fns above are reused without a separate mock set.
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
      findFirst:  mockCustomerFindUnique,
    },
    customerNotification: {
      create: mockCustomerNotifCreate,
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txProxy = { $executeRaw: vi.fn(async () => 1) };
      return fn(txProxy);
    }),
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
describe("POST /api/orders — HOTFIX-001 + HOTFIX-004", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Baseline: no idempotency duplicate, unlimited plan, no customer row.
    mockOrderFindFirst.mockResolvedValue(null);
    mockOrderCount.mockResolvedValue(0);
    mockTenantFindFirst.mockResolvedValue({ plan: "free" });
    mockProductFindMany.mockResolvedValue([]);
    mockCustomerFindUnique.mockResolvedValue(null);
    mockCustomerNotifCreate.mockResolvedValue(undefined);
    mockOrdersGetByCustomerPhone.mockResolvedValue([]);

    // OrdersDB.add echoes the order back with a fresh id (simulating persistence).
    mockOrdersAdd.mockImplementation(
      async (order: Record<string, unknown>, _tenant: string) => ({
        ...order,
        id: `saved-${Math.random().toString(36).slice(2, 8)}`,
      }),
    );
  });

  // ── (a) HOTFIX-001 happy path ───────────────────────────────────────────
  it("HOTFIX-001 (audit P0 #1): rejects 422 when client tries to fake the total", async () => {
    // DB catalog for tenant A: product 42 is whisky at S/50.00 (cost S/30.00)
    mockProductFindMany.mockResolvedValue([
      { id: 42, price: dec(50), costPrice: dec(30) },
    ]);

    const req = makePostReq(
      {
        customer: { name: "Malicioso", phone: "+51900000000" },
        // Attacker tries price=0.01 — server price is 50, mismatch → reject.
        items: [{ id: 42, name: "Whisky", price: 0.01, quantity: 1 }],
        total: 0.01,
      },
      { "x-tenant-id": TENANT_A },
    );

    const res = await POST(req, defaultCtx);
    // audit P0 #1 (2026-05-18): antes 201 con server-side override; ahora
    // rechazo explícito con 422 TOTAL_MISMATCH para cerrar el vector.
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("TOTAL_MISMATCH");
    expect(body.serverTotal).toBe(50);

    // OrdersDB.add NO debe haber sido llamado (rechazo antes del persist).
    expect(mockOrdersAdd).not.toHaveBeenCalled();

    // Verify the product fetch was scoped by tenantId (HOTFIX-001 multi-tenant guard).
    expect(mockProductFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_A,
          id: { in: [42] },
        }),
      }),
    );
  });

  // ── (b) HOTFIX-001 unknown product ─────────────────────────────────────
  it("HOTFIX-001: rejects 400 invalid_product when productId is not in the tenant catalog", async () => {
    // Nothing in the catalog — product 99999 does not exist.
    mockProductFindMany.mockResolvedValue([]);

    const req = makePostReq(
      {
        customer: { name: "Ghost" },
        items: [{ id: 99999, name: "Fake", price: 1, quantity: 1 }],
        total: 1,
      },
      { "x-tenant-id": TENANT_A },
    );

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_product");
    expect(body.productId).toBe(99999);
    expect(mockOrdersAdd).not.toHaveBeenCalled();
  });

  // ── (c) HOTFIX-004 same-tenant replay ───────────────────────────────────
  it("HOTFIX-004: same-tenant idempotency replay returns the existing order", async () => {
    const existingOrder = {
      id: "ord-existing-abc",
      customer: {
        name: "Repeat",
        phone: "+51911111111",
        location: "",
        reference: "",
      },
      items: [],
      total: 25,
      status: "pendiente",
      paymentMethod: "efectivo",
      idempotencyKey: "KEY-REPLAY",
      tenantId: TENANT_A,
      createdAt: "2026-04-09T00:00:00Z",
      updatedAt: "2026-04-09T00:00:00Z",
    };
    mockOrderFindFirst.mockResolvedValue(existingOrder);

    const req = makePostReq(
      {
        customer: { name: "Repeat" },
        items: [{ id: 1, name: "Arroz", price: 5, quantity: 1 }],
        total: 5,
      },
      {
        "x-tenant-id": TENANT_A,
        "x-idempotency-key": "KEY-REPLAY",
      },
    );

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("ord-existing-abc");
    expect(mockOrdersAdd).not.toHaveBeenCalled();

    // The where clause MUST include both idempotencyKey AND tenantId.
    expect(mockOrderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idempotencyKey: "KEY-REPLAY",
          tenantId: TENANT_A,
        }),
      }),
    );
  });

  // ── (d) HOTFIX-004 cross-tenant collision ───────────────────────────────
  it("HOTFIX-004: cross-tenant key replay creates a NEW order (no leakage)", async () => {
    // Simulate tenant A's pre-existing order under "KEY-SHARED".
    const tenantAOrder = {
      id: "ord-tenant-a-secret",
      customer: { name: "Alice" },
      items: [],
      total: 999,
      status: "pendiente",
      paymentMethod: "efectivo",
      idempotencyKey: "KEY-SHARED",
      tenantId: TENANT_A,
      createdAt: "2026-04-09T00:00:00Z",
      updatedAt: "2026-04-09T00:00:00Z",
    };

    // findFirst returns tenant A's order ONLY when queried with tenantId=A.
    mockOrderFindFirst.mockImplementation(
      async (args: unknown): Promise<typeof tenantAOrder | null> => {
        const where = (args as { where?: { idempotencyKey?: string; tenantId?: string } })
          .where;
        if (
          where?.idempotencyKey === "KEY-SHARED" &&
          where?.tenantId === TENANT_A
        ) {
          return tenantAOrder;
        }
        return null;
      },
    );

    // Tenant B has its own catalog: product id=7 exists only for tenant B.
    mockProductFindMany.mockImplementation(async (args: unknown) => {
      const where = (args as {
        where: { tenantId: string; id: { in: number[] } };
      }).where;
      if (where.tenantId === TENANT_B && where.id.in.includes(7)) {
        return [{ id: 7, price: dec(10), costPrice: dec(6) }];
      }
      return [];
    });

    const req = makePostReq(
      {
        customer: { name: "Bob" },
        items: [{ id: 7, name: "Pan", price: 10, quantity: 1 }],
        total: 10,
      },
      {
        "x-tenant-id": TENANT_B,
        "x-idempotency-key": "KEY-SHARED", // same key as tenant A
      },
    );

    const res = await POST(req, defaultCtx);
    expect(res.status).toBe(201); // NEW order, not the 200 replay path
    const body = await res.json();

    // Tenant B MUST NOT receive tenant A's secret order.
    expect(body.id).not.toBe("ord-tenant-a-secret");
    expect(body.total).toBe(10); // tenant B's server-computed total
    expect(mockOrdersAdd).toHaveBeenCalledTimes(1);

    // And OrdersDB.add ran for tenant B, not tenant A.
    const addCall = mockOrdersAdd.mock.calls[0];
    expect(addCall?.[1]).toBe(TENANT_B);

    // The idempotency lookup used tenantId=tenant-b.
    const lookupCall = mockOrderFindFirst.mock.calls.find((c) => {
      const w = (c?.[0] as { where?: { idempotencyKey?: string } })?.where;
      return w?.idempotencyKey === "KEY-SHARED";
    });
    expect(lookupCall).toBeDefined();
    const lookupWhere = (lookupCall?.[0] as { where: { tenantId: string } }).where;
    expect(lookupWhere.tenantId).toBe(TENANT_B);
  });
});
