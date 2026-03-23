/**
 * API /api/batches/expired – unit tests
 * Covers: auth failure, lotes vencidos, tenantId, error handling, array vacío, shape de respuesta
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

const { mockGetExpiredWithStock } = vi.hoisted(() => ({
  mockGetExpiredWithStock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  BatchesDB: {
    getExpiredWithStock: mockGetExpiredWithStock,
  },
}));

import { GET } from "@/app/api/batches/expired/route";

const AUTH = { tenantId: "main", role: "admin", username: "test" };
const AUTH_ALMACENERO = { tenantId: "tenant-xyz", role: "almacenero", username: "almacen1" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

const BATCHES_MOCK = [
  {
    id: "batch-1",
    productId: "prod-1",
    tenantId: "main",
    quantity: 10,
    expiryDate: new Date("2024-01-01"),
    costPrice: 5.5,
  },
  {
    id: "batch-2",
    productId: "prod-2",
    tenantId: "main",
    quantity: 3,
    expiryDate: new Date("2024-02-15"),
    costPrice: 12.0,
  },
];

function makeReq(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

// ── GET /api/batches/expired ──────────────────────────────────────────────────

describe("GET /api/batches/expired", () => {
  beforeEach(() => vi.clearAllMocks());

  // 1. Sin auth → 401
  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(makeReq("https://host/api/batches/expired"));
    expect(res.status).toBe(401);
  });

  // 2. Auth válido → 200 + array de lotes vencidos
  it("returns 200 with expired batches array when authenticated", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetExpiredWithStock.mockResolvedValue(BATCHES_MOCK);
    const res = await GET(makeReq("https://host/api/batches/expired"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  // 3. Verificar que usa el tenantId correcto del auth
  it("calls getExpiredWithStock with tenantId from auth", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetExpiredWithStock.mockResolvedValue(BATCHES_MOCK);
    await GET(makeReq("https://host/api/batches/expired"));
    expect(mockGetExpiredWithStock).toHaveBeenCalledWith("main");
    expect(mockGetExpiredWithStock).toHaveBeenCalledTimes(1);
  });

  // 4. getExpiredWithStock falla → 500
  it("returns 500 when getExpiredWithStock throws", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetExpiredWithStock.mockRejectedValue(new Error("DB connection failed"));
    const res = await GET(makeReq("https://host/api/batches/expired"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  // 5. Sin lotes vencidos → array vacío
  it("returns empty array when no expired batches exist", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetExpiredWithStock.mockResolvedValue([]);
    const res = await GET(makeReq("https://host/api/batches/expired"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  // 6. Respuesta tiene estructura { data: [...] }
  it("returns response wrapped in { data: [...] }", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetExpiredWithStock.mockResolvedValue(BATCHES_MOCK);
    const res = await GET(makeReq("https://host/api/batches/expired"));
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
  });

  // 7. Usa tenantId correcto para otro tenant (aislamiento multi-tenant)
  it("calls getExpiredWithStock with tenantId from almacenero auth", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ALMACENERO);
    mockGetExpiredWithStock.mockResolvedValue([]);
    await GET(makeReq("https://host/api/batches/expired"));
    expect(mockGetExpiredWithStock).toHaveBeenCalledWith("tenant-xyz");
  });
});
