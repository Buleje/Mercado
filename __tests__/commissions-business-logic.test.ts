/**
 * __tests__/commissions-business-logic.test.ts
 *
 * Unit tests para lib/commissions.ts — comisiones marketplace cross-vendor.
 * CRÍTICO: este módulo decide cuánto dinero cobra Buleje a cada tienda
 * por las ventas del marketplace. Bug aquí = facturación incorrecta a vendors.
 *
 * Cobertura:
 *  - calculateCommission (pura): cálculo % + redondeo 2 decimales
 *  - recordCommission (mock prisma): fallback "main" si no tenantId
 *  - recordMarketplaceCommissions: orden completa con/sin delivery
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDecimal } from "./helpers/mocks";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockLedgerCreate = vi.fn();
const mockLedgerFindFirst = vi.fn();
const mockLedgerFindMany = vi.fn();
const mockStoreFindFirst = vi.fn();
const mockAssignmentFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    commissionLedger: {
      create: (...a: unknown[]) => mockLedgerCreate(...a),
      findFirst: (...a: unknown[]) => mockLedgerFindFirst(...a),
      findMany: (...a: unknown[]) => mockLedgerFindMany(...a),
    },
    store: { findFirst: (...a: unknown[]) => mockStoreFindFirst(...a) },
    deliveryAssignment: { findFirst: (...a: unknown[]) => mockAssignmentFindFirst(...a) },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/decimal-utils", () => ({
  toNumOrZero: (v: unknown) => (v == null ? 0 : Number(v)),
}));

import {
  calculateCommission,
  recordCommission,
  recordMarketplaceCommissions,
} from "@/lib/commissions";

const TENANT = "test-tenant";
const ORDER_ID = "order-abc";
const STORE_ID = "store-xyz";
const PARTNER_ID = "partner-123";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── calculateCommission — función pura ───────────────────────────────────────

describe("calculateCommission — cálculo % + redondeo", () => {
  it("5% default sobre 100 = 5", () => {
    expect(calculateCommission(100)).toBe(5);
  });

  it("rate explícito 10% sobre 100 = 10", () => {
    expect(calculateCommission(100, 10)).toBe(10);
  });

  it("redondea a 2 decimales (banker rounding)", () => {
    // 33.333 * 5% = 1.66665 → 1.67
    expect(calculateCommission(33.333, 5)).toBe(1.67);
  });

  it("redondea 0.005 correctamente (0% → 0)", () => {
    // 0.1 * 5% = 0.005 → 0.01 (Math.round upward 0.5)
    expect(calculateCommission(0.1, 5)).toBe(0.01);
  });

  it("orderTotal=0 retorna 0", () => {
    expect(calculateCommission(0)).toBe(0);
  });

  it("rate=0 retorna 0 (tienda sin comisión)", () => {
    expect(calculateCommission(1000, 0)).toBe(0);
  });

  it("rate=100 retorna orderTotal completo (edge case)", () => {
    expect(calculateCommission(50, 100)).toBe(50);
  });

  it("maneja montos grandes sin floating-point drift", () => {
    expect(calculateCommission(9999.99, 7)).toBe(700);
  });

  it("orderTotal negativo (refund?) retorna negativo redondeado", () => {
    expect(calculateCommission(-100, 5)).toBe(-5);
  });

  it("rate decimal 7.5%", () => {
    expect(calculateCommission(200, 7.5)).toBe(15);
  });
});

// ─── recordCommission — tenantId obligatorio + idempotencia ───────────────────
// Audit 2026-05-17 P0-2/P0-3: signature contract change — tenantId obligatorio.

describe("recordCommission — tenantId obligatorio (no fallback 'main')", () => {
  it("crea row en commissionLedger con tenantId explícito", async () => {
    mockLedgerFindFirst.mockResolvedValue(null); // no duplicado
    mockLedgerCreate.mockResolvedValue({});
    await recordCommission({
      orderId: ORDER_ID,
      storeId: STORE_ID,
      type: "marketplace_fee",
      amount: 10,
      rate: 5,
      tenantId: TENANT,
    });
    expect(mockLedgerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: ORDER_ID,
        storeId: STORE_ID,
        tenantId: TENANT,
        type: "marketplace_fee",
        amount: 10,
        rate: 5,
        status: "pending",
      }),
    });
  });

  it("THROW si NO se pasa tenantId (fail-loud, no fallback silencioso)", async () => {
    await expect(
      recordCommission({
        orderId: ORDER_ID,
        type: "marketplace_fee",
        amount: 10,
        rate: 5,
        tenantId: "",
      })
    ).rejects.toThrow(/tenantId is required/);
  });

  it("IDEMPOTENCIA: skip si ya existe (orderId, type)", async () => {
    mockLedgerFindFirst.mockResolvedValue({ id: "existing-1", status: "pending" });
    await recordCommission({
      orderId: ORDER_ID,
      type: "marketplace_fee",
      amount: 10,
      rate: 5,
      tenantId: TENANT,
    });
    expect(mockLedgerCreate).not.toHaveBeenCalled();
  });

  it("partnerId opcional: null si no se pasa", async () => {
    mockLedgerFindFirst.mockResolvedValue(null);
    mockLedgerCreate.mockResolvedValue({});
    await recordCommission({
      orderId: ORDER_ID,
      storeId: STORE_ID,
      type: "marketplace_fee",
      amount: 10,
      rate: 5,
      tenantId: TENANT,
    });
    expect(mockLedgerCreate.mock.calls[0][0].data.partnerId).toBeNull();
  });

  it("partnerId presente: incluido en data", async () => {
    mockLedgerFindFirst.mockResolvedValue(null);
    mockLedgerCreate.mockResolvedValue({});
    await recordCommission({
      orderId: ORDER_ID,
      partnerId: PARTNER_ID,
      type: "delivery_fee",
      amount: 8,
      rate: 0,
      tenantId: TENANT,
    });
    expect(mockLedgerCreate.mock.calls[0][0].data.partnerId).toBe(PARTNER_ID);
  });

  it("storeId opcional: null si no se pasa", async () => {
    mockLedgerFindFirst.mockResolvedValue(null);
    mockLedgerCreate.mockResolvedValue({});
    await recordCommission({
      orderId: ORDER_ID,
      type: "platform_fee",
      amount: 5,
      rate: 0,
      tenantId: TENANT,
    });
    expect(mockLedgerCreate.mock.calls[0][0].data.storeId).toBeNull();
  });

  it("AHORA propaga errores (no swallow) para que el caller decida si reintentar", async () => {
    mockLedgerFindFirst.mockResolvedValue(null);
    mockLedgerCreate.mockRejectedValue(new Error("DB down"));
    // Audit P1-2 fix: ya no swallow — el caller (fire-and-forget) envuelve si quiere.
    await expect(
      recordCommission({
        orderId: ORDER_ID,
        type: "marketplace_fee",
        amount: 10,
        rate: 5,
        tenantId: TENANT,
      })
    ).rejects.toThrow("DB down");
  });

  it("status siempre 'pending' al crear (workflow downstream marca paid/failed)", async () => {
    mockLedgerFindFirst.mockResolvedValue(null);
    mockLedgerCreate.mockResolvedValue({});
    await recordCommission({
      orderId: ORDER_ID,
      type: "marketplace_fee",
      amount: 10,
      rate: 5,
      tenantId: TENANT,
    });
    expect(mockLedgerCreate.mock.calls[0][0].data.status).toBe("pending");
  });
});

// ─── recordMarketplaceCommissions — orchestration completa ────────────────────

describe("recordMarketplaceCommissions — flow completo (tier dinámico)", () => {
  beforeEach(() => {
    mockLedgerFindFirst.mockResolvedValue(null);
    mockLedgerFindMany.mockResolvedValue([]); // sin ventas históricas → tier bronze
  });

  it("usa override rate de la tienda cuando != 5", async () => {
    mockStoreFindFirst.mockResolvedValue({ commission: mockDecimal(8) });
    mockLedgerCreate.mockResolvedValue({});
    mockAssignmentFindFirst.mockResolvedValue(null);

    await recordMarketplaceCommissions(TENANT, ORDER_ID, 100, STORE_ID);
    // override 8% gana sobre el tier bronze default 5%
    expect(mockLedgerCreate.mock.calls[0][0].data.amount).toBe(8);
    expect(mockLedgerCreate.mock.calls[0][0].data.rate).toBe(8);
  });

  it("tier bronze 5% cuando store sin override y sin ventas históricas", async () => {
    mockStoreFindFirst.mockResolvedValue({ commission: mockDecimal(5) });
    mockLedgerCreate.mockResolvedValue({});

    await recordMarketplaceCommissions(TENANT, ORDER_ID, 200, STORE_ID);
    expect(mockLedgerCreate.mock.calls[0][0].data.rate).toBe(5);
    expect(mockLedgerCreate.mock.calls[0][0].data.amount).toBe(10); // 200 * 5%
  });

  it("rate fallback 5% si la tienda no existe en el tenant", async () => {
    mockStoreFindFirst.mockResolvedValue(null);
    mockLedgerCreate.mockResolvedValue({});

    await recordMarketplaceCommissions(TENANT, ORDER_ID, 100, STORE_ID);
    expect(mockLedgerCreate.mock.calls[0][0].data.amount).toBe(5);
  });

  it("solo registra 1 comisión (marketplace_fee) si no hay delivery partner", async () => {
    mockStoreFindFirst.mockResolvedValue({ commission: mockDecimal(5) });
    mockLedgerCreate.mockResolvedValue({});

    await recordMarketplaceCommissions(TENANT, ORDER_ID, 100, STORE_ID);
    expect(mockLedgerCreate).toHaveBeenCalledTimes(1);
    expect(mockLedgerCreate.mock.calls[0][0].data.type).toBe("marketplace_fee");
  });

  it("registra 2 comisiones (marketplace + delivery) si hay partner con assignment", async () => {
    mockStoreFindFirst.mockResolvedValue({ commission: mockDecimal(5) });
    mockLedgerCreate.mockResolvedValue({});
    mockAssignmentFindFirst.mockResolvedValue({ fee: 8 });

    await recordMarketplaceCommissions(TENANT, ORDER_ID, 100, STORE_ID, PARTNER_ID);
    expect(mockLedgerCreate).toHaveBeenCalledTimes(2);
    expect(mockLedgerCreate.mock.calls[0][0].data.type).toBe("marketplace_fee");
    expect(mockLedgerCreate.mock.calls[1][0].data.type).toBe("delivery_fee");
    expect(mockLedgerCreate.mock.calls[1][0].data.partnerId).toBe(PARTNER_ID);
    expect(mockLedgerCreate.mock.calls[1][0].data.amount).toBe(8);
    expect(mockLedgerCreate.mock.calls[1][0].data.rate).toBe(0);
  });

  it("NO registra delivery_fee si partner existe pero assignment NO existe", async () => {
    mockStoreFindFirst.mockResolvedValue({ commission: mockDecimal(5) });
    mockLedgerCreate.mockResolvedValue({});
    mockAssignmentFindFirst.mockResolvedValue(null);

    await recordMarketplaceCommissions(TENANT, ORDER_ID, 100, STORE_ID, PARTNER_ID);
    expect(mockLedgerCreate).toHaveBeenCalledTimes(1);
  });

  it("delivery fee usa toNumOrZero para manejar Decimal de Prisma", async () => {
    mockStoreFindFirst.mockResolvedValue({ commission: mockDecimal(5) });
    mockLedgerCreate.mockResolvedValue({});
    mockAssignmentFindFirst.mockResolvedValue({ fee: "10.50" });

    await recordMarketplaceCommissions(TENANT, ORDER_ID, 100, STORE_ID, PARTNER_ID);
    expect(mockLedgerCreate.mock.calls[1][0].data.amount).toBe(10.5);
  });

  it("THROW si tenantId vacío en recordMarketplaceCommissions", async () => {
    await expect(
      recordMarketplaceCommissions("", ORDER_ID, 100, STORE_ID)
    ).rejects.toThrow(/tenantId is required/);
  });
});
