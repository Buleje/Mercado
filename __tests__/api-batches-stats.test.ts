/**
 * API /api/batches/stats – unit tests
 * Covers: auth failure, stats object shape, tenantId, error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

const { mockGetStats } = vi.hoisted(() => ({
  mockGetStats: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  BatchesDB: {
    getStats: mockGetStats,
  },
}));

import { GET } from "@/app/api/batches/stats/route";

const AUTH = { tenantId: "main", role: "admin", username: "test" };
const AUTH_CAJERO = { tenantId: "main", role: "cajero", username: "cajero1" };
const AUTH_ALMACENERO = { tenantId: "tenant-xyz", role: "almacenero", username: "almacen1" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

const STATS_MOCK = {
  totalBatches: 50,
  activeBatches: 30,
  expiredWithStock: 5,
  expiringWithin7Days: 3,
  expiringWithin30Days: 8,
  emptyBatches: 15,
  totalUnits: 1200,
};

function makeReq(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

// ── GET /api/batches/stats ────────────────────────────────────────────────────

describe("GET /api/batches/stats", () => {
  beforeEach(() => vi.clearAllMocks());

  // 1. Sin auth → 401
  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(makeReq("https://host/api/batches/stats"));
    expect(res.status).toBe(401);
  });

  // 2. Auth valido → 200 + stats object
  it("returns 200 with stats object when authenticated", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetStats.mockResolvedValue(STATS_MOCK);
    const res = await GET(makeReq("https://host/api/batches/stats"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(STATS_MOCK);
  });

  // 3. Verificar shape del objeto stats
  it("returns stats object with all required fields", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetStats.mockResolvedValue(STATS_MOCK);
    const res = await GET(makeReq("https://host/api/batches/stats"));
    const body = await res.json();
    expect(body).toHaveProperty("totalBatches");
    expect(body).toHaveProperty("activeBatches");
    expect(body).toHaveProperty("expiredWithStock");
    expect(body).toHaveProperty("expiringWithin7Days");
    expect(body).toHaveProperty("expiringWithin30Days");
    expect(body).toHaveProperty("emptyBatches");
    expect(body).toHaveProperty("totalUnits");
  });

  // 4. Verificar tipos numéricos en stats
  it("returns numeric values in all stats fields", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetStats.mockResolvedValue(STATS_MOCK);
    const res = await GET(makeReq("https://host/api/batches/stats"));
    const body = await res.json();
    expect(typeof body.totalBatches).toBe("number");
    expect(typeof body.activeBatches).toBe("number");
    expect(typeof body.expiredWithStock).toBe("number");
    expect(typeof body.expiringWithin7Days).toBe("number");
    expect(typeof body.expiringWithin30Days).toBe("number");
    expect(typeof body.emptyBatches).toBe("number");
    expect(typeof body.totalUnits).toBe("number");
  });

  // 5. Verificar que usa tenantId del auth
  it("calls getStats with tenantId from auth", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetStats.mockResolvedValue(STATS_MOCK);
    await GET(makeReq("https://host/api/batches/stats"));
    expect(mockGetStats).toHaveBeenCalledWith("main");
    expect(mockGetStats).toHaveBeenCalledTimes(1);
  });

  // 6. Verificar que usa tenantId correcto con otro tenant
  it("calls getStats with tenantId from almacenero auth", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ALMACENERO);
    mockGetStats.mockResolvedValue({ ...STATS_MOCK, totalBatches: 10 });
    await GET(makeReq("https://host/api/batches/stats"));
    expect(mockGetStats).toHaveBeenCalledWith("tenant-xyz");
  });

  // 7. Rol cajero también tiene acceso
  it("returns 200 for cajero role", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_CAJERO);
    mockGetStats.mockResolvedValue(STATS_MOCK);
    const res = await GET(makeReq("https://host/api/batches/stats"));
    expect(res.status).toBe(200);
  });

  // 8. getStats() falla → 500
  it("returns 500 when getStats throws", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetStats.mockRejectedValue(new Error("DB connection failed"));
    const res = await GET(makeReq("https://host/api/batches/stats"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  // 9. Inventario vacío → todos los campos en 0
  it("returns zeros when tenant has no batches", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const emptyStats = {
      totalBatches: 0,
      activeBatches: 0,
      expiredWithStock: 0,
      expiringWithin7Days: 0,
      expiringWithin30Days: 0,
      emptyBatches: 0,
      totalUnits: 0,
    };
    mockGetStats.mockResolvedValue(emptyStats);
    const res = await GET(makeReq("https://host/api/batches/stats"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalBatches).toBe(0);
    expect(body.totalUnits).toBe(0);
  });

  // 10. expiringWithin7Days <= expiringWithin30Days (coherencia de datos)
  it("returns coherent stats where 7-day expiring <= 30-day expiring", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetStats.mockResolvedValue(STATS_MOCK);
    const res = await GET(makeReq("https://host/api/batches/stats"));
    const body = await res.json();
    expect(body.expiringWithin7Days).toBeLessThanOrEqual(body.expiringWithin30Days);
  });
});
