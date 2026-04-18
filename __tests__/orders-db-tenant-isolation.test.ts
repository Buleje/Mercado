/**
 * HOTFIX-002 — OrdersDB tenant isolation regression tests.
 *
 * Locks down the contract that getById/update/delete must accept tenantId as
 * the first parameter and refuse cross-tenant access by returning null (or
 * silently no-oping for delete) instead of leaking the cross-tenant row.
 *
 * The previous version of these methods omitted tenantId from the Prisma
 * where clause, allowing any authenticated admin to read, mutate, or destroy
 * orders belonging to a different tenant by guessing the order id.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock prisma BEFORE importing the module under test ──────────────────────
// vi.mock factories are hoisted to the top of the file, so the mock object
// must be created via vi.hoisted to be available inside the factory.

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    order: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    customer: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/domain-events", () => ({
  DomainEvents: {
    ventaCompletada: vi.fn().mockReturnValue({ catch: vi.fn() }),
  },
}));

vi.mock("@/lib/whatsapp-order-notify", () => ({
  notifyOwnerNewOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/tenant", () => ({
  findTenantByIdOrSlug: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/coupons/auto-coupon-triggers", () => ({
  checkAndIssueCoupons: vi.fn().mockResolvedValue(undefined),
}));

import { OrdersDB } from "@/lib/db/orders.db";

// ── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

function makeOrderRow(id: string, tenantId: string) {
  return {
    id,
    tenantId,
    customerName: "Cliente Test",
    customerPhone: "987654321",
    customerLocation: "Av Test 123",
    customerReference: "Casa azul",
    total: 100,
    totalCogs: null,
    status: "pendiente",
    notes: null,
    paymentMethod: "efectivo",
    yapeOperationNumber: null,
    deuda: null,
    appliedCouponCode: null,
    couponDiscount: null,
    appliedPromoId: null,
    discountAmount: null,
    riderName: null,
    deletedAt: null,
    cancelReason: null,
    cancelledAt: null,
    idempotencyKey: null,
    createdAt: new Date("2026-04-09T00:00:00.000Z"),
    updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    items: [
      {
        id: 1,
        orderId: id,
        productId: 10,
        name: "Inca Kola",
        price: 50,
        costPrice: null,
        quantity: 2,
        unit: "unidad",
        image: "/inka.webp",
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getById ─────────────────────────────────────────────────────────────────

describe("OrdersDB.getById tenant isolation", () => {
  it("(a) returns the order when tenantId matches", async () => {
    const row = makeOrderRow("ord-1", TENANT_A);
    mockPrisma.order.findFirst.mockResolvedValueOnce(row);

    const result = await OrdersDB.getById(TENANT_A, "ord-1");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("ord-1");
    // Verify the where clause includes tenantId — this is the heart of the fix
    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: "ord-1", tenantId: TENANT_A },
      include: { items: true },
    });
  });

  it("(b) returns null when tenantId does NOT match (cross-tenant read blocked)", async () => {
    // Prisma findFirst will return null because of the tenantId predicate
    mockPrisma.order.findFirst.mockResolvedValueOnce(null);

    const result = await OrdersDB.getById(TENANT_A, "ord-from-tenant-b");

    expect(result).toBeNull();
    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: "ord-from-tenant-b", tenantId: TENANT_A },
      include: { items: true },
    });
  });
});

// ── update ──────────────────────────────────────────────────────────────────

describe("OrdersDB.update tenant isolation", () => {
  it("(c) returns null when attempting to update a cross-tenant order", async () => {
    // Tenant-scoped existence check sees no row → null, never reaches prisma.order.update
    mockPrisma.order.findFirst.mockResolvedValueOnce(null);

    const result = await OrdersDB.update(TENANT_A, "ord-from-tenant-b", {
      status: "cancelado",
    });

    expect(result).toBeNull();
    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: "ord-from-tenant-b", tenantId: TENANT_A },
    });
    // Critical: prisma.order.update must NOT be invoked
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });

  it("happy path: updates and returns the order when tenantId matches", async () => {
    const existing = makeOrderRow("ord-1", TENANT_A);
    mockPrisma.order.findFirst.mockResolvedValueOnce(existing);
    mockPrisma.order.update.mockResolvedValueOnce({ ...existing, status: "confirmado" });

    const result = await OrdersDB.update(TENANT_A, "ord-1", { status: "confirmado" });

    expect(result).not.toBeNull();
    expect(result?.status).toBe("confirmado");
    expect(mockPrisma.order.update).toHaveBeenCalledTimes(1);
  });
});

// ── getByCustomerPhone ──────────────────────────────────────────────────────

describe("OrdersDB.getByCustomerPhone tenant isolation (HOTFIX-005 / SN-1)", () => {
  it("(e) returns only same-tenant orders when called with (tenantId, phone)", async () => {
    const row = makeOrderRow("ord-a1", TENANT_A);
    mockPrisma.order.findMany.mockResolvedValueOnce([row]);

    const result = await OrdersDB.getByCustomerPhone(TENANT_A, "987654321");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ord-a1");
    // Heart of the fix — the where clause must include tenantId
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_A, customerPhone: "987654321" },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
  });

  it("(f) returns empty array when cross-tenant phone has no orders in this tenant", async () => {
    // Sanity fixture: the same phone has an order in TENANT_B. Prisma findMany
    // MUST filter it out because our where clause pins tenantId = TENANT_A.
    const tenantBRow = makeOrderRow("ord-b1", TENANT_B);
    expect(tenantBRow.tenantId).toBe(TENANT_B); // fixture lives in the other tenant
    mockPrisma.order.findMany.mockResolvedValueOnce([]);

    const result = await OrdersDB.getByCustomerPhone(TENANT_A, "987654321");

    expect(result).toEqual([]);
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_A, customerPhone: "987654321" },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
  });
});

// ── delete ──────────────────────────────────────────────────────────────────

describe("OrdersDB.delete tenant isolation", () => {
  it("(d) silently no-ops when attempting to delete a cross-tenant order", async () => {
    // deleteMany returns count: 0 when nothing matches the (id, tenantId) pair
    mockPrisma.order.deleteMany.mockResolvedValueOnce({ count: 0 });

    await expect(OrdersDB.delete(TENANT_A, "ord-from-tenant-b")).resolves.toBeUndefined();

    expect(mockPrisma.order.deleteMany).toHaveBeenCalledWith({
      where: { id: "ord-from-tenant-b", tenantId: TENANT_A },
    });
    // The legacy single-row delete must NOT be used
    expect(mockPrisma.order.delete).not.toHaveBeenCalled();
  });

  it("happy path: deletes the order when tenantId matches", async () => {
    mockPrisma.order.deleteMany.mockResolvedValueOnce({ count: 1 });

    await expect(OrdersDB.delete(TENANT_A, "ord-1")).resolves.toBeUndefined();

    expect(mockPrisma.order.deleteMany).toHaveBeenCalledWith({
      where: { id: "ord-1", tenantId: TENANT_A },
    });
  });
});
