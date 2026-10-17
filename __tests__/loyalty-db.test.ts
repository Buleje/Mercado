/**
 * lib/db/loyalty.db.ts — unit tests
 *
 * Covers TASK-005 / ADR-024 acceptance criteria:
 *   1. earn() increments balance and writes a positive ledger row
 *   2. redeem() decrements balance and refuses negative balance
 *   3. getHistory() is tenant-isolated (cross-tenant guard)
 *   4. backfill script is idempotent (skip-when-already-backfilled)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  getOrSet: vi.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(async () => undefined),
}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    customer: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    loyaltyTransaction: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  LoyaltyDB,
  LoyaltyInsufficientBalanceError,
  LoyaltyCrossTenantError,
} from "@/lib/db/loyalty.db";
import { backfillLoyaltyTransactions } from "@/scripts/backfill-loyalty-transactions";
import { invalidateByPrefix } from "@/lib/cache";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const PHONE_A = "+51999000111";

beforeEach(() => {
  vi.clearAllMocks();
});

// ──────────────────────────────────────────────────────────────────────────────
// Case 1 — earn() increments balance and writes a positive ledger row
// ──────────────────────────────────────────────────────────────────────────────
describe("LoyaltyDB.earn", () => {
  it("inserts a positive ledger row and increments Customer.loyaltyPoints atomically", async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      phone: PHONE_A,
      tenantId: TENANT_A,
      loyaltyPoints: 50,
    });

    const createdRow = {
      id: "tx-1",
      customerId: PHONE_A,
      tenantId: TENANT_A,
      amount: 30,
      reason: "purchase",
      metadata: { orderId: "ord-9" },
      createdAt: new Date("2026-04-09T12:00:00Z"),
    };

    // $transaction usa la API de callback (interactive tx).
    // El código retorna [ledger] desde la callback.
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
    mockPrisma.loyaltyTransaction.create.mockResolvedValueOnce(createdRow);
    // customer.update para el incremento (rama signedAmount > 0)
    mockPrisma.customer.update = vi.fn().mockResolvedValueOnce({ phone: PHONE_A, loyaltyPoints: 80 });

    const result = await LoyaltyDB.earn(
      TENANT_A,
      PHONE_A,
      30,
      "purchase",
      { orderId: "ord-9" },
    );

    // La transacción fue invocada con una función (callback API, no batch).
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = mockPrisma.$transaction.mock.calls[0]?.[0];
    expect(typeof ops).toBe("function");

    // Cache invalidation runs after the write — CLAUDE.md rule #5.
    expect(invalidateByPrefix).toHaveBeenCalledWith(`loyalty:${TENANT_A}:${PHONE_A}`);

    expect(result.amount).toBe(30);
    expect(result.reason).toBe("purchase");
    expect(result.tenantId).toBe(TENANT_A);
    expect(result.customerId).toBe(PHONE_A);
    expect(result.metadata).toEqual({ orderId: "ord-9" });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Case 2 — redeem() decrements balance, refuses to go negative
// ──────────────────────────────────────────────────────────────────────────────
describe("LoyaltyDB.redeem", () => {
  it("decrements balance when sufficient", async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      phone: PHONE_A,
      tenantId: TENANT_A,
      loyaltyPoints: 100,
    });

    const createdRow = {
      id: "tx-2",
      customerId: PHONE_A,
      tenantId: TENANT_A,
      amount: -40,
      reason: "redemption",
      metadata: null,
      createdAt: new Date("2026-04-09T12:30:00Z"),
    };

    mockPrisma.$transaction.mockResolvedValueOnce([
      createdRow,
      { phone: PHONE_A, loyaltyPoints: 60 },
    ]);

    const result = await LoyaltyDB.redeem(TENANT_A, PHONE_A, 40, "redemption");

    expect(result.amount).toBe(-40);
    expect(result.reason).toBe("redemption");
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(invalidateByPrefix).toHaveBeenCalledWith(`loyalty:${TENANT_A}:${PHONE_A}`);
  });

  it("throws LoyaltyInsufficientBalanceError when balance would go negative", async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      phone: PHONE_A,
      tenantId: TENANT_A,
      loyaltyPoints: 10,
    });

    await expect(
      LoyaltyDB.redeem(TENANT_A, PHONE_A, 50, "redemption"),
    ).rejects.toBeInstanceOf(LoyaltyInsufficientBalanceError);

    // The atomic write must NEVER have run.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(invalidateByPrefix).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Case 3 — getHistory() is tenant-isolated
// ──────────────────────────────────────────────────────────────────────────────
describe("LoyaltyDB.getHistory — tenant isolation", () => {
  it("refuses cross-tenant reads with LoyaltyCrossTenantError", async () => {
    // Customer belongs to tenant B but caller claims tenant A.
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      phone: PHONE_A,
      tenantId: TENANT_B,
      loyaltyPoints: 999,
    });

    await expect(
      LoyaltyDB.getHistory(TENANT_A, PHONE_A),
    ).rejects.toBeInstanceOf(LoyaltyCrossTenantError);

    // The history query must NEVER have run.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.loyaltyTransaction.findMany).not.toHaveBeenCalled();
  });

  it("returns paginated history scoped to the caller's tenantId", async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      phone: PHONE_A,
      tenantId: TENANT_A,
      loyaltyPoints: 250,
    });

    const rows = [
      {
        id: "tx-newest",
        customerId: PHONE_A,
        tenantId: TENANT_A,
        amount: 100,
        reason: "purchase",
        metadata: null,
        createdAt: new Date("2026-04-08T10:00:00Z"),
      },
      {
        id: "tx-older",
        customerId: PHONE_A,
        tenantId: TENANT_A,
        amount: 150,
        reason: "promotion",
        metadata: null,
        createdAt: new Date("2026-04-01T10:00:00Z"),
      },
    ];

    mockPrisma.$transaction.mockResolvedValueOnce([rows, 2]);

    const page = await LoyaltyDB.getHistory(TENANT_A, PHONE_A, 20, 0);

    expect(page.balance).toBe(250);
    expect(page.total).toBe(2);
    expect(page.transactions).toHaveLength(2);
    expect(page.transactions[0]?.id).toBe("tx-newest");
    // Tenant ID is enforced upstream — every returned row carries it.
    expect(page.transactions.every((t) => t.tenantId === TENANT_A)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Case 4 — backfill script is idempotent
// ──────────────────────────────────────────────────────────────────────────────
describe("backfillLoyaltyTransactions — idempotency", () => {
  it("skips customers that already have a 'backfill' row", async () => {
    // Two customers in the same batch, then an empty batch to break the loop.
    mockPrisma.customer.findMany
      .mockResolvedValueOnce([
        { phone: "+51900000001", tenantId: TENANT_A, loyaltyPoints: 100, createdAt: new Date("2026-01-01") },
        { phone: "+51900000002", tenantId: TENANT_A, loyaltyPoints: 50, createdAt: new Date("2026-01-02") },
      ])
      .mockResolvedValueOnce([]);

    // First customer is ALREADY backfilled — must be skipped.
    mockPrisma.loyaltyTransaction.findFirst
      .mockResolvedValueOnce({ id: "existing-backfill" })
      .mockResolvedValueOnce(null);

    mockPrisma.loyaltyTransaction.create.mockResolvedValue({
      id: "new-backfill",
      customerId: "+51900000002",
      tenantId: TENANT_A,
      amount: 50,
      reason: "backfill",
      metadata: {},
      createdAt: new Date(),
    });

    const stats = await backfillLoyaltyTransactions();

    expect(stats.scanned).toBe(2);
    expect(stats.skipped).toBe(1);
    expect(stats.inserted).toBe(1);
    expect(stats.zeroBalance).toBe(0);

    // Exactly ONE create call — the already-backfilled customer was skipped.
    expect(mockPrisma.loyaltyTransaction.create).toHaveBeenCalledTimes(1);
    const createArgs = mockPrisma.loyaltyTransaction.create.mock.calls[0]?.[0];
    expect(createArgs?.data?.customerId).toBe("+51900000002");
    expect(createArgs?.data?.reason).toBe("backfill");
    expect(createArgs?.data?.amount).toBe(50);
  });
});
