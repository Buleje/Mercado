/**
 * API /api/inventory-movements – bulk-adjust tests
 * Covers: auth, Zod validation, succeededIds, partial failure, all-fail
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

const { mockAdjust, mockRecord, mockList } = vi.hoisted(() => ({
  mockAdjust: vi.fn(),
  mockRecord: vi.fn(),
  mockList: vi.fn(),
}));
vi.mock("@/lib/jsondb", () => ({
  InventoryMovementsDB: {
    adjust: mockAdjust,
    record: mockRecord,
    list: mockList,
  },
}));

import { POST } from "@/app/api/inventory-movements/route";

const AUTH = { tenantId: "main", role: "admin", username: "test" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

function makeReq(body: unknown): NextRequest {
  return new NextRequest("https://host/api/inventory-movements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BULK_BODY = {
  action: "bulk-adjust",
  items: [
    { productId: 1, newStock: 10, notes: "conteo 1" },
    { productId: 2, newStock: 20, notes: "conteo 2" },
    { productId: 3, newStock: 5 },
  ],
};

// ── Auth ─────────────────────────────────────────────────────────────────────

describe("POST /api/inventory-movements bulk-adjust – auth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makeReq(BULK_BODY));
    expect(res.status).toBe(401);
  });
});

// ── Validation ───────────────────────────────────────────────────────────────

describe("POST /api/inventory-movements bulk-adjust – validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
  });

  it("returns 400 when items array is empty", async () => {
    const res = await POST(makeReq({ action: "bulk-adjust", items: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when items is missing", async () => {
    const res = await POST(makeReq({ action: "bulk-adjust" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when productId is not a positive integer", async () => {
    const res = await POST(makeReq({ action: "bulk-adjust", items: [{ productId: -1, newStock: 10 }] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when newStock is negative", async () => {
    const res = await POST(makeReq({ action: "bulk-adjust", items: [{ productId: 1, newStock: -5 }] }));
    expect(res.status).toBe(400);
  });
});

// ── Success cases ─────────────────────────────────────────────────────────────

describe("POST /api/inventory-movements bulk-adjust – all succeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
  });

  it("returns 201 with correct succeeded/failed counts", async () => {
    mockAdjust.mockResolvedValue(undefined);
    const res = await POST(makeReq(BULK_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.succeeded).toBe(3);
    expect(body.failed).toBe(0);
  });

  it("returns succeededIds containing all productIds when all pass", async () => {
    mockAdjust.mockResolvedValue(undefined);
    const res = await POST(makeReq(BULK_BODY));
    const body = await res.json();
    expect(body.succeededIds).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(body.succeededIds).toHaveLength(3);
  });

  it("calls adjust once per item with correct args", async () => {
    mockAdjust.mockResolvedValue(undefined);
    await POST(makeReq(BULK_BODY));
    expect(mockAdjust).toHaveBeenCalledTimes(3);
    expect(mockAdjust).toHaveBeenCalledWith(1, 10, "main", undefined, "conteo 1", "test");
    expect(mockAdjust).toHaveBeenCalledWith(2, 20, "main", undefined, "conteo 2", "test");
    expect(mockAdjust).toHaveBeenCalledWith(3, 5, "main", undefined, undefined, "test");
  });
});

// ── Partial failure ────────────────────────────────────────────────────────────

describe("POST /api/inventory-movements bulk-adjust – partial failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
  });

  it("returns succeeded=2 failed=1 when middle item throws", async () => {
    mockAdjust
      .mockResolvedValueOnce(undefined)         // productId 1 – OK
      .mockRejectedValueOnce(new Error("DB error")) // productId 2 – FAIL
      .mockResolvedValueOnce(undefined);         // productId 3 – OK
    const res = await POST(makeReq(BULK_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(1);
  });

  it("succeededIds excludes the failed productId", async () => {
    mockAdjust
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce(undefined);
    const res = await POST(makeReq(BULK_BODY));
    const body = await res.json();
    expect(body.succeededIds).toContain(1);
    expect(body.succeededIds).not.toContain(2);
    expect(body.succeededIds).toContain(3);
  });
});

// ── All fail ──────────────────────────────────────────────────────────────────

describe("POST /api/inventory-movements bulk-adjust – all fail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
  });

  it("returns succeeded=0 failed=3 with empty succeededIds", async () => {
    mockAdjust.mockRejectedValue(new Error("DB down"));
    const res = await POST(makeReq(BULK_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.succeeded).toBe(0);
    expect(body.failed).toBe(3);
    expect(body.succeededIds).toEqual([]);
  });
});
