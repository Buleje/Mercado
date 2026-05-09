/**
 * Coupon Validation Test Suite
 *
 * Tests the POST /api/coupons/validate endpoint logic:
 * - Missing code → 400
 * - Coupon not found → 404
 * - Inactive coupon → 400
 * - Expired coupon → 400
 * - Exhausted uses → 400
 * - Min purchase not met → 400
 * - Percent discount calculation
 * - Fixed discount calculation
 * - Gift card with balance
 * - Gift card exhausted → 400
 * - Rate limit → 429
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { mockGetByCode } = vi.hoisted(() => ({
  mockGetByCode: vi.fn(),
}));

vi.mock("@/lib/jsondb", () => ({
  CouponsDB: { getByCode: mockGetByCode },
}));

const { mockRateLimit, mockGetClientIp } = vi.hoisted(() => ({
  mockRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 9, resetAt: 0 }),
  mockGetClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mockRateLimit,
  getClientIp: mockGetClientIp,
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

// ── Import SUT after mocks ────────────────────────────────────────────────────

import { POST } from "@/app/api/coupons/validate/route";
import { NextRequest } from "next/server";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://localhost:3000/api/coupons/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeCoupon(overrides: Record<string, unknown> = {}) {
  return {
    code: "TEST10",
    active: true,
    discountType: "percent",
    discountValue: 10,
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
    minPurchase: null,
    balance: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/coupons/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetAt: 0 });
  });

  it("returns 429 when rate limited", async () => {
    mockRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const res = await POST(makeRequest({ code: "X", cartTotal: 100 }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when code is missing", async () => {
    const res = await POST(makeRequest({ cartTotal: 100 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/código/i);
  });

  it("returns 404 when coupon not found", async () => {
    mockGetByCode.mockResolvedValue(null);
    const res = await POST(makeRequest({ code: "INVALID", cartTotal: 100 }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when coupon is inactive", async () => {
    mockGetByCode.mockResolvedValue(makeCoupon({ active: false }));
    const res = await POST(makeRequest({ code: "TEST10", cartTotal: 100 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/inactivo/i);
  });

  it("returns 400 when coupon is expired", async () => {
    mockGetByCode.mockResolvedValue(makeCoupon({
      expiresAt: new Date("2020-01-01").toISOString(),
    }));
    const res = await POST(makeRequest({ code: "TEST10", cartTotal: 100 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/expirado/i);
  });

  it("returns 400 when max uses exhausted", async () => {
    mockGetByCode.mockResolvedValue(makeCoupon({ maxUses: 5, usedCount: 5 }));
    const res = await POST(makeRequest({ code: "TEST10", cartTotal: 100 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/agotado/i);
  });

  it("returns 400 when cart total below minPurchase", async () => {
    mockGetByCode.mockResolvedValue(makeCoupon({ minPurchase: 50 }));
    const res = await POST(makeRequest({ code: "TEST10", cartTotal: 30 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/mínimo/i);
  });

  it("calculates percent discount correctly", async () => {
    mockGetByCode.mockResolvedValue(makeCoupon({ discountType: "percent", discountValue: 15 }));
    const res = await POST(makeRequest({ code: "TEST10", cartTotal: 200 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.discount).toBe(30); // 15% of 200
  });

  it("calculates fixed discount correctly (capped at cartTotal)", async () => {
    mockGetByCode.mockResolvedValue(makeCoupon({ discountType: "fixed", discountValue: 20 }));
    const res = await POST(makeRequest({ code: "TEST10", cartTotal: 15 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.discount).toBe(15); // min(20, 15)
  });

  it("calculates fixed discount when cartTotal is larger", async () => {
    mockGetByCode.mockResolvedValue(makeCoupon({ discountType: "fixed", discountValue: 10 }));
    const res = await POST(makeRequest({ code: "TEST10", cartTotal: 100 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.discount).toBe(10);
  });

  it("handles gift card with remaining balance", async () => {
    mockGetByCode.mockResolvedValue(makeCoupon({
      discountType: "giftcard",
      discountValue: 50,
      balance: 30,
    }));
    const res = await POST(makeRequest({ code: "GIFT", cartTotal: 100 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.discount).toBe(30); // min(balance, cartTotal)
  });

  it("returns 400 when gift card balance is 0", async () => {
    mockGetByCode.mockResolvedValue(makeCoupon({
      discountType: "giftcard",
      discountValue: 50,
      balance: 0,
    }));
    const res = await POST(makeRequest({ code: "GIFT", cartTotal: 100 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/saldo/i);
  });

  it("returns coupon object along with discount", async () => {
    const coupon = makeCoupon();
    mockGetByCode.mockResolvedValue(coupon);
    const res = await POST(makeRequest({ code: "TEST10", cartTotal: 100 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.coupon).toBeDefined();
    expect(data.coupon.code).toBe("TEST10");
    expect(data.discount).toBe(10); // 10% of 100
  });

  it("returns 503 when DB throws", async () => {
    mockGetByCode.mockRejectedValue(new Error("DB down"));
    const res = await POST(makeRequest({ code: "TEST10", cartTotal: 100 }));
    expect(res.status).toBe(503);
  });
});
