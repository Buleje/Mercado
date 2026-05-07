/**
 * M2 — marketplace-coupon-validity.test.ts
 *
 * Tests POST /api/marketplace/coupons/validate
 * Cubre: expirado, agotado, monto mínimo, cupón válido
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/api-error", () => ({
  toErrorPayload: vi.fn((err: unknown) => ({
    payload: { error: String(err) },
    status: 500,
  })),
  newTraceId: vi.fn(() => "trace-test"),
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null), // nunca bloquear en tests
}));

const mockGetBySlug = vi.fn();
const mockFindByCode = vi.fn();

vi.mock("@/lib/db/marketplace.db", () => ({
  MarketplaceStoresDB: {
    getBySlug: mockGetBySlug,
  },
}));

vi.mock("@/lib/db/coupons.db", () => ({
  CouponsDB: {
    findByCode: mockFindByCode,
  },
}));

// toNumOrZero real desde decimal-utils (no mock — función pura)
// El route la importa de @/lib/decimal-utils; el alias resuelve al real.

const { POST } = await import("@/app/api/marketplace/coupons/validate/route");

const VALID_STORE = { id: "store-1", tenantId: "tenant-a", name: "Tienda A" };

function makeReq(body: object) {
  return new NextRequest("http://localhost/api/marketplace/coupons/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeCoupon(overrides: object = {}) {
  return {
    id: "coup-1",
    code: "PROMO10",
    active: true,
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
    minPurchase: 0,
    discountType: "fixed",
    discountValue: 10,
    description: "10 soles de descuento",
    ...overrides,
  };
}

describe("POST /api/marketplace/coupons/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBySlug.mockResolvedValue(VALID_STORE);
  });

  it("cupón expirado retorna { valid: false, reason: /expirado/i }", async () => {
    mockFindByCode.mockResolvedValueOnce(
      makeCoupon({ expiresAt: new Date("2020-01-01") })
    );

    const res = await POST(makeReq({ code: "PROMO10", storeSlug: "tienda-a", cartTotal: 50 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.valid).toBe(false);
    expect(body.reason).toMatch(/expirado/i);
  });

  it("cupón agotado (usedCount >= maxUses) retorna { valid: false, reason: /agotado/i }", async () => {
    mockFindByCode.mockResolvedValueOnce(
      makeCoupon({ maxUses: 5, usedCount: 5 })
    );

    const res = await POST(makeReq({ code: "PROMO10", storeSlug: "tienda-a", cartTotal: 50 }));
    const body = await res.json();

    expect(body.valid).toBe(false);
    expect(body.reason).toMatch(/agotado/i);
  });

  it("cartTotal < minPurchase retorna { valid: false, reason: contiene 'S/' }", async () => {
    mockFindByCode.mockResolvedValueOnce(
      makeCoupon({ minPurchase: 100, discountValue: 10 })
    );

    const res = await POST(makeReq({ code: "PROMO10", storeSlug: "tienda-a", cartTotal: 50 }));
    const body = await res.json();

    expect(body.valid).toBe(false);
    expect(body.reason).toContain("S/");
  });

  it("cupón válido retorna { valid: true, discount: number }", async () => {
    mockFindByCode.mockResolvedValueOnce(
      makeCoupon({ discountType: "fixed", discountValue: 10 })
    );

    const res = await POST(makeReq({ code: "PROMO10", storeSlug: "tienda-a", cartTotal: 80 }));
    const body = await res.json();

    expect(body.valid).toBe(true);
    expect(typeof body.discount).toBe("number");
    expect(body.discount).toBeGreaterThan(0);
  });
});
