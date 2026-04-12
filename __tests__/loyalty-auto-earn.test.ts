/**
 * Tests unitarios para lib/loyalty/auto-earn.ts — autoEarnLoyaltyPoints
 *
 * Cubre:
 *  1. EARN NORMAL: orderTotal=50, balance previo=0 → 50 puntos, Bronce→Bronce
 *  2. DUPLICADO: historial ya contiene orderId → retorna null
 *  3. MÍNIMO: orderTotal=3 (< S/5) → retorna null sin llamar LoyaltyDB.earn
 *  4. TIER UPGRADE: balance previo=480 + earn 30 → Plata→Oro, tierUpgrade=true
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockLogActivity } = vi.hoisted(() => ({
  mockLogActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: mockLogActivity,
}));

const { mockGetHistory, mockEarn, mockGetBalance } = vi.hoisted(() => ({
  mockGetHistory: vi.fn(),
  mockEarn: vi.fn(),
  mockGetBalance: vi.fn(),
}));

vi.mock("@/lib/db/loyalty.db", () => ({
  LoyaltyDB: {
    getHistory: mockGetHistory,
    earn: mockEarn,
    getBalance: mockGetBalance,
  },
}));

// ── Import SUT after mocks ──────────────────────────────────────────────────

import { autoEarnLoyaltyPoints } from "@/lib/loyalty/auto-earn";

// ── Fixtures ────────────────────────────────────────────────────────────────

const TENANT = "tenant-001";
const CUSTOMER = "951000001";
const ORDER_ID = "order-abc-123";

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("autoEarnLoyaltyPoints", () => {
  // ─── 1. EARN NORMAL ──────────────────────────────────────────────────────
  it("acredita 50 puntos para orderTotal=50 con balance previo=0 (Bronce→Bronce)", async () => {
    // Balance previo = 0, sin transacciones existentes
    mockGetHistory.mockResolvedValue({
      transactions: [],
      balance: 0,
      total: 0,
    });
    mockEarn.mockResolvedValue({
      id: "tx-001",
      customerId: CUSTOMER,
      tenantId: TENANT,
      amount: 50,
      reason: "purchase",
      metadata: { orderId: ORDER_ID },
      createdAt: new Date().toISOString(),
    });
    mockGetBalance.mockResolvedValue(50);

    const result = await autoEarnLoyaltyPoints(TENANT, CUSTOMER, ORDER_ID, 50);

    expect(result).not.toBeNull();
    expect(result!.pointsEarned).toBe(50);
    expect(result!.newBalance).toBe(50);
    expect(result!.previousTier).toBe("Bronce");
    expect(result!.currentTier).toBe("Bronce");
    expect(result!.tierUpgrade).toBe(false);
    expect(result!.transactionId).toBe("tx-001");

    // Verifica que LoyaltyDB.earn fue llamado correctamente
    expect(mockEarn).toHaveBeenCalledOnce();
    expect(mockEarn).toHaveBeenCalledWith(
      TENANT,
      CUSTOMER,
      50,
      "purchase",
      expect.objectContaining({ orderId: ORDER_ID, orderTotal: 50, source: "auto-earn" }),
    );

    // logActivity fire-and-forget fue invocado
    expect(mockLogActivity).toHaveBeenCalledOnce();
  });

  // ─── 2. DUPLICADO ────────────────────────────────────────────────────────
  it("retorna null si la orden ya fue acreditada (anti-duplicación)", async () => {
    // El historial ya contiene una transacción con metadata.orderId === ORDER_ID
    mockGetHistory.mockResolvedValue({
      transactions: [
        {
          id: "tx-existing",
          customerId: CUSTOMER,
          tenantId: TENANT,
          amount: 50,
          reason: "purchase",
          metadata: { orderId: ORDER_ID, source: "auto-earn" },
          createdAt: new Date().toISOString(),
        },
      ],
      balance: 50,
      total: 1,
    });

    const result = await autoEarnLoyaltyPoints(TENANT, CUSTOMER, ORDER_ID, 50);

    expect(result).toBeNull();
    // LoyaltyDB.earn NO debe ser llamado
    expect(mockEarn).not.toHaveBeenCalled();
  });

  // ─── 3. MÍNIMO ───────────────────────────────────────────────────────────
  it("retorna null sin llamar LoyaltyDB.earn cuando orderTotal < 5", async () => {
    const result = await autoEarnLoyaltyPoints(TENANT, CUSTOMER, ORDER_ID, 3);

    expect(result).toBeNull();
    // Ni siquiera consulta el historial, corta antes
    expect(mockGetHistory).not.toHaveBeenCalled();
    expect(mockEarn).not.toHaveBeenCalled();
    expect(mockGetBalance).not.toHaveBeenCalled();
  });

  // ─── 4. TIER UPGRADE ────────────────────────────────────────────────────
  it("detecta tier upgrade Plata→Oro cuando balance 480 + earn 30 = 510", async () => {
    // Balance previo = 480 → Plata (100-499)
    mockGetHistory.mockResolvedValue({
      transactions: [],
      balance: 480,
      total: 0,
    });
    mockEarn.mockResolvedValue({
      id: "tx-upgrade",
      customerId: CUSTOMER,
      tenantId: TENANT,
      amount: 30,
      reason: "purchase",
      metadata: { orderId: ORDER_ID },
      createdAt: new Date().toISOString(),
    });
    // Nuevo balance = 480 + 30 = 510 → Oro (500-1999)
    mockGetBalance.mockResolvedValue(510);

    const result = await autoEarnLoyaltyPoints(TENANT, CUSTOMER, ORDER_ID, 30);

    expect(result).not.toBeNull();
    expect(result!.pointsEarned).toBe(30);
    expect(result!.newBalance).toBe(510);
    expect(result!.previousTier).toBe("Plata");
    expect(result!.currentTier).toBe("Oro");
    expect(result!.tierUpgrade).toBe(true);
    expect(result!.transactionId).toBe("tx-upgrade");

    // Verifica que earn fue llamado con los puntos correctos
    expect(mockEarn).toHaveBeenCalledWith(
      TENANT,
      CUSTOMER,
      30,
      "purchase",
      expect.objectContaining({ orderId: ORDER_ID, orderTotal: 30, source: "auto-earn" }),
    );

    // logActivity fue invocado (fire-and-forget)
    expect(mockLogActivity).toHaveBeenCalledOnce();
  });
});
