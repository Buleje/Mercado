/**
 * CommissionsDB — Vendor Tier escalonado + Refunds + PayoutSummary.
 *
 * Audit 2026-05-17 (construcción gaps 1, 2, 3):
 *  - computeVendorTier: rate dinámico por volumen últimos 30d
 *  - refundCommissionsByOrder: reversa atómica con audit trail
 *  - payoutSummaryByVendor: agrupación por storeId/partnerId
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLedgerFindMany = vi.fn();
const mockLedgerFindFirst = vi.fn();
const mockLedgerCreate = vi.fn();
const mockLedgerUpdateMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    commissionLedger: {
      findMany: (...a: unknown[]) => mockLedgerFindMany(...a),
      findFirst: (...a: unknown[]) => mockLedgerFindFirst(...a),
      create: (...a: unknown[]) => mockLedgerCreate(...a),
      updateMany: (...a: unknown[]) => mockLedgerUpdateMany(...a),
      groupBy: vi.fn(),
    },
    store: { findFirst: vi.fn() },
    deliveryAssignment: { findFirst: vi.fn() },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => mockTransaction(cb),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/decimal-utils", () => ({
  toNumOrZero: (v: unknown) => (v == null ? 0 : Number(v)),
}));

const TENANT = "tenant-1";
const STORE_ID = "store-xyz";
const ORDER_ID = "order-abc";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── computeVendorTier ───────────────────────────────────────────────────────

describe("CommissionsDB.computeVendorTier — tier escalonado por volumen", () => {
  it("Bronze (5%) por defecto sin ventas históricas", async () => {
    mockLedgerFindMany.mockResolvedValue([]);
    const { CommissionsDB } = await import("@/lib/db/commissions.db");
    const result = await CommissionsDB.computeVendorTier(TENANT, STORE_ID);
    expect(result.tier).toBe("bronze");
    expect(result.rate).toBe(5);
    expect(result.ventas30d).toBe(0);
    expect(result.nextTier).toBe("silver");
    expect(result.threshold).toBe(5000);
  });

  it("Silver (4%) cuando ventas 30d en S/5,000-15,000", async () => {
    // 3 fees x S/100 con rate 5% = S/100/0.05 = S/2,000 cada uno → S/6,000 total
    mockLedgerFindMany.mockResolvedValue([
      { amount: 100, rate: 5 },
      { amount: 100, rate: 5 },
      { amount: 100, rate: 5 },
    ]);
    const { CommissionsDB } = await import("@/lib/db/commissions.db");
    const result = await CommissionsDB.computeVendorTier(TENANT, STORE_ID);
    expect(result.tier).toBe("silver");
    expect(result.rate).toBe(4);
    expect(result.ventas30d).toBe(6000);
    expect(result.nextTier).toBe("gold");
  });

  it("Gold (3%) cuando ventas 30d en S/15,000-50,000", async () => {
    mockLedgerFindMany.mockResolvedValue([{ amount: 1000, rate: 5 }]); // S/20,000
    const { CommissionsDB } = await import("@/lib/db/commissions.db");
    const result = await CommissionsDB.computeVendorTier(TENANT, STORE_ID);
    expect(result.tier).toBe("gold");
    expect(result.rate).toBe(3);
    expect(result.nextTier).toBe("platinum");
  });

  it("Platinum (2%) cuando ventas 30d > S/50,000", async () => {
    mockLedgerFindMany.mockResolvedValue([{ amount: 3000, rate: 5 }]); // S/60,000
    const { CommissionsDB } = await import("@/lib/db/commissions.db");
    const result = await CommissionsDB.computeVendorTier(TENANT, STORE_ID);
    expect(result.tier).toBe("platinum");
    expect(result.rate).toBe(2);
    expect(result.nextTier).toBeNull();
    expect(result.threshold).toBe(0);
  });

  it("override Store.commission != 5 GANA sobre tier calculado", async () => {
    mockLedgerFindMany.mockResolvedValue([]); // sería bronze 5%
    const { CommissionsDB } = await import("@/lib/db/commissions.db");
    const result = await CommissionsDB.computeVendorTier(TENANT, STORE_ID, 7.5);
    expect(result.rate).toBe(7.5); // override gana
    expect(result.tier).toBe("bronze"); // tier base sigue calculado
  });

  it("override == 5 NO gana (es el default, tier toma el lead)", async () => {
    mockLedgerFindMany.mockResolvedValue([{ amount: 1000, rate: 5 }]); // gold range
    const { CommissionsDB } = await import("@/lib/db/commissions.db");
    const result = await CommissionsDB.computeVendorTier(TENANT, STORE_ID, 5);
    expect(result.rate).toBe(3); // gold gana porque override era el default
  });

  it("ignora rows con rate=0 (delivery_fee) en cálculo de ventas", async () => {
    mockLedgerFindMany.mockResolvedValue([
      { amount: 100, rate: 0 },  // delivery — debería ignorarse
      { amount: 100, rate: 5 },  // = S/2000 ventas
    ]);
    const { CommissionsDB } = await import("@/lib/db/commissions.db");
    const result = await CommissionsDB.computeVendorTier(TENANT, STORE_ID);
    expect(result.ventas30d).toBe(2000); // solo el de rate 5%
  });
});

// ─── refundCommissionsByOrder ────────────────────────────────────────────────

describe("CommissionsDB.refundCommissionsByOrder — reversa atómica", () => {
  it("revierte 2 comisiones (marketplace + delivery) creando 2 reversals", async () => {
    const txMock = {
      commissionLedger: {
        findMany: vi.fn().mockResolvedValue([
          { id: "c1", orderId: ORDER_ID, type: "marketplace_fee", amount: 10, rate: 5, storeId: STORE_ID, partnerId: null },
          { id: "c2", orderId: ORDER_ID, type: "delivery_fee",   amount: 8,  rate: 0, storeId: null, partnerId: "p1" },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        create: vi.fn()
          .mockResolvedValueOnce({ id: "r1" })
          .mockResolvedValueOnce({ id: "r2" }),
      },
    };
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock));

    const { CommissionsDB } = await import("@/lib/db/commissions.db");
    const result = await CommissionsDB.refundCommissionsByOrder(TENANT, ORDER_ID, "cliente devolvió");

    expect(result.reversed).toHaveLength(2);
    expect(result.totalReversed).toBe(18); // 10 + 8
    expect(result.reversalIds).toEqual(["r1", "r2"]);
    expect(txMock.commissionLedger.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT, id: { in: ["c1", "c2"] } }),
        data: expect.objectContaining({ status: "refunded" }),
      })
    );
    // Verificar que se crearon 2 reversals con amount negativo
    expect(txMock.commissionLedger.create).toHaveBeenCalledTimes(2);
    expect(txMock.commissionLedger.create.mock.calls[0][0].data.amount).toBe(-10);
    expect(txMock.commissionLedger.create.mock.calls[0][0].data.type).toBe("refund_reversal");
    expect(txMock.commissionLedger.create.mock.calls[1][0].data.amount).toBe(-8);
  });

  it("retorna empty si no hay comisiones activas para la orden", async () => {
    const txMock = {
      commissionLedger: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
        create: vi.fn(),
      },
    };
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock));

    const { CommissionsDB } = await import("@/lib/db/commissions.db");
    const result = await CommissionsDB.refundCommissionsByOrder(TENANT, ORDER_ID);

    expect(result.reversed).toHaveLength(0);
    expect(result.totalReversed).toBe(0);
    expect(txMock.commissionLedger.updateMany).not.toHaveBeenCalled();
  });

  it("THROW si tenantId vacío", async () => {
    const { CommissionsDB } = await import("@/lib/db/commissions.db");
    await expect(
      CommissionsDB.refundCommissionsByOrder("", ORDER_ID)
    ).rejects.toThrow(/tenantId required/);
  });
});

// ─── payoutSummaryByVendor ───────────────────────────────────────────────────

describe("CommissionsDB.payoutSummaryByVendor — agrupación por vendor", () => {
  it("agrupa por storeId + partnerId, suma amounts, descarta refund_reversal", async () => {
    mockLedgerFindMany.mockResolvedValue([
      { storeId: "store-A", partnerId: null, type: "marketplace_fee", amount: 50 },
      { storeId: "store-A", partnerId: null, type: "marketplace_fee", amount: 30 },
      { storeId: "store-B", partnerId: null, type: "marketplace_fee", amount: 20 },
      { storeId: null, partnerId: "partner-1", type: "delivery_fee", amount: 8 },
    ]);
    const { CommissionsDB } = await import("@/lib/db/commissions.db");
    const result = await CommissionsDB.payoutSummaryByVendor(TENANT, "settled");

    expect(result).toHaveLength(3); // 2 stores + 1 partner
    const storeA = result.find(v => v.vendorId === "store-A");
    expect(storeA?.total).toBe(80);
    expect(storeA?.count).toBe(2);
    expect(storeA?.types.marketplace_fee).toBe(80);

    const partnerEntry = result.find(v => v.vendorId === "partner-1");
    expect(partnerEntry?.vendorType).toBe("partner");
    expect(partnerEntry?.total).toBe(8);
  });

  it("THROW si tenantId vacío", async () => {
    const { CommissionsDB } = await import("@/lib/db/commissions.db");
    await expect(
      CommissionsDB.payoutSummaryByVendor("")
    ).rejects.toThrow(/tenantId required/);
  });
});
