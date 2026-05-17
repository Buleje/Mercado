/**
 * Hot-fix P0 — Tanda 2: Quality fixes + finance.addPayment defense-in-depth.
 *
 * Q-P0-2 · stripe-session requireAdmin con roles explícitos ["owner","admin"]
 * Q-P0-3 · payment-proof requireAdmin con roles ["owner","admin","manager"]
 * Q-P0-1 · payment-proof PaymentApproval findFirst con tenantId
 * Q-P0-4 · purchases.db invalidate en 3 métodos write
 * B-P0-3 · finance.addPayment payable.updateMany con tenantId
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSupplierCreate = vi.fn();
const mockSupplierDeleteMany = vi.fn();
const mockPurchaseOrderCreate = vi.fn();
const mockPurchaseOrderUpdateMany = vi.fn();
const mockPurchaseOrderDeleteMany = vi.fn();
const mockPurchaseOrderFindFirst = vi.fn();
const mockInvalidateAfterPurchase = vi.fn();
const mockPayableUpdateMany = vi.fn();
const mockPayableFindFirst = vi.fn();
const mockPaymentCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supplier: { create: mockSupplierCreate, deleteMany: mockSupplierDeleteMany, findFirst: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    purchaseOrder: { create: mockPurchaseOrderCreate, updateMany: mockPurchaseOrderUpdateMany, deleteMany: mockPurchaseOrderDeleteMany, findFirst: mockPurchaseOrderFindFirst, findMany: vi.fn() },
    payable: { findFirst: mockPayableFindFirst, updateMany: mockPayableUpdateMany, update: vi.fn() },
    payment: { create: mockPaymentCreate },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => cb({
      payable: { findFirst: mockPayableFindFirst, updateMany: mockPayableUpdateMany },
      payment: { create: mockPaymentCreate },
    }),
  },
}));

vi.mock("@/lib/admin-cache", () => ({
  invalidateAdminCache: {
    afterPurchase: mockInvalidateAfterPurchase,
    afterPayable: vi.fn(),
    afterOrder: vi.fn(),
    afterProduct: vi.fn(),
    afterCustomer: vi.fn(),
    afterDocument: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/decimal-utils", () => ({
  toNumOrZero: (v: unknown) => (v == null ? 0 : Number(v)),
}));

const TENANT = "tenant-1";

// ─── Q-P0-4 · purchases.db invalidate ────────────────────────────────────────

describe("Q-P0-4 · purchases.db invalida cache en writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("SuppliersDB.add llama invalidateAdminCache.afterPurchase", async () => {
    mockSupplierCreate.mockResolvedValue({
      id: "s1", name: "Test", ruc: null, phone: null, email: null,
      address: null, notes: null, tenantId: TENANT, createdAt: new Date(), updatedAt: new Date(),
    });

    const { SuppliersDB } = await import("@/lib/db/purchases.db");
    await SuppliersDB.add({ id: "s1", name: "Test" } as never, TENANT);

    expect(mockInvalidateAfterPurchase).toHaveBeenCalledWith(TENANT);
  });

  it("SuppliersDB.delete llama invalidateAdminCache.afterPurchase", async () => {
    mockSupplierDeleteMany.mockResolvedValue({ count: 1 });
    const { SuppliersDB } = await import("@/lib/db/purchases.db");
    await SuppliersDB.delete(TENANT, "s1");
    expect(mockInvalidateAfterPurchase).toHaveBeenCalledWith(TENANT);
  });

  it("PurchasesDB.add llama invalidateAdminCache.afterPurchase", async () => {
    mockPurchaseOrderCreate.mockResolvedValue({
      id: "po1", supplierId: "s1", supplierName: "Test", total: 100,
      status: "pendiente", notes: null, paymentMethod: null, deliveryDate: null,
      discount: 0, tenantId: TENANT, items: [], createdAt: new Date(), updatedAt: new Date(),
    });
    const { PurchasesDB } = await import("@/lib/db/purchases.db");
    await PurchasesDB.add({
      id: "po1", supplierId: "s1", supplierName: "Test", total: 100,
      status: "pendiente", items: [], discount: 0,
    } as never, TENANT);
    expect(mockInvalidateAfterPurchase).toHaveBeenCalledWith(TENANT);
  });

  it("PurchasesDB.update llama invalidate", async () => {
    mockPurchaseOrderFindFirst.mockResolvedValue({
      id: "po1", supplierId: "s1", supplierName: "Test", total: 100,
      status: "pendiente", notes: null, paymentMethod: null, deliveryDate: null,
      discount: 0, tenantId: TENANT, items: [], createdAt: new Date(), updatedAt: new Date(),
    });
    mockPurchaseOrderUpdateMany.mockResolvedValue({ count: 1 });
    const { PurchasesDB } = await import("@/lib/db/purchases.db");
    await PurchasesDB.update(TENANT, "po1", { status: "recibido" } as never);
    expect(mockInvalidateAfterPurchase).toHaveBeenCalledWith(TENANT);
  });

  it("PurchasesDB.delete llama invalidate", async () => {
    mockPurchaseOrderDeleteMany.mockResolvedValue({ count: 1 });
    const { PurchasesDB } = await import("@/lib/db/purchases.db");
    await PurchasesDB.delete(TENANT, "po1");
    expect(mockInvalidateAfterPurchase).toHaveBeenCalledWith(TENANT);
  });
});

// ─── B-P0-3 · finance.addPayment updateMany con tenantId ─────────────────────

describe("B-P0-3 · finance.addPayment payable.updateMany con tenantId (defense-in-depth)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updateMany del payable incluye tenantId en where (no solo id)", async () => {
    const fakePayable = {
      id: "p1", tenantId: TENANT, amount: 100, paidAmount: 0, payments: [],
      supplierId: "s1", supplierName: "Test", description: "test",
      dueDate: new Date(), status: "pendiente", paymentMethod: null,
      notes: null, purchaseOrderId: null, deletedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    mockPayableFindFirst.mockResolvedValueOnce(fakePayable);
    mockPayableFindFirst.mockResolvedValueOnce({ ...fakePayable, paidAmount: 50, status: "parcial" });
    mockPaymentCreate.mockResolvedValue({});
    mockPayableUpdateMany.mockResolvedValue({ count: 1 });

    const { PayablesDB } = await import("@/lib/db/finance.db");
    await PayablesDB.addPayment(TENANT, "p1", {
      id: "pay1", amount: 50, method: "efectivo", date: new Date().toISOString(),
    } as never);

    expect(mockPayableUpdateMany).toHaveBeenCalled();
    const call = mockPayableUpdateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "p1", tenantId: TENANT });
  });
});
