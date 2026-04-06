/**
 * API /api/batches/expiring – unit tests
 * Covers: auth failure, query validation, default days, formato respuesta, error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

const { mockGetExpiring } = vi.hoisted(() => ({
  mockGetExpiring: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  BatchesDB: {
    getExpiring: mockGetExpiring,
  },
}));

import { GET } from "@/app/api/batches/expiring/route";

const AUTH = { tenantId: "main", role: "admin", username: "test" };
const AUTH_TENANT2 = { tenantId: "sucursal-norte", role: "almacenero", username: "almacen2" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

const NOW = new Date("2026-01-01T00:00:00Z");
const BATCH_EXPIRING = {
  id: "b1",
  tenantId: "main",
  lote: "LOT-001",
  productName: "Leche Gloria",
  productCategory: "Lacteos",
  quantity: 24,
  unit: "unidad",
  supplierId: null,
  supplierName: "Distribuidora Norte",
  entryDate: "2025-12-01",
  expiryDate: "2026-01-05",
  costUnit: 3.5,
  notes: "",
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
};

function makeReq(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

// ── GET /api/batches/expiring ─────────────────────────────────────────────────

describe("GET /api/batches/expiring", () => {
  beforeEach(() => vi.clearAllMocks());

  // 1. Sin auth → 401
  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(makeReq("https://host/api/batches/expiring"));
    expect(res.status).toBe(401);
  });

  // 2. Auth valido → 200 + array de lotes
  it("returns 200 with batch array when authenticated", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetExpiring.mockResolvedValue([BATCH_EXPIRING]);
    const res = await GET(makeReq("https://host/api/batches/expiring"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].lote).toBe("LOT-001");
  });

  // 3. ?days=14 → respeta el parámetro
  it("calls getExpiring with days=14 when ?days=14", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetExpiring.mockResolvedValue([]);
    const res = await GET(makeReq("https://host/api/batches/expiring?days=14"));
    expect(res.status).toBe(200);
    expect(mockGetExpiring).toHaveBeenCalledWith("main", 14);
    const body = await res.json();
    expect(body.days).toBe(14);
  });

  // 4. ?days=0 → validación falla (min 1)
  it("returns 400 when days=0 (below minimum)", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await GET(makeReq("https://host/api/batches/expiring?days=0"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  // 5. ?days=400 → validación falla (max 365)
  it("returns 400 when days=400 (above maximum)", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await GET(makeReq("https://host/api/batches/expiring?days=400"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("issues");
  });

  // 6. Sin ?days → default 7
  it("uses default days=7 when no query param", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetExpiring.mockResolvedValue([]);
    const res = await GET(makeReq("https://host/api/batches/expiring"));
    expect(mockGetExpiring).toHaveBeenCalledWith("main", 7);
    const body = await res.json();
    expect(body.days).toBe(7);
  });

  // 7. getExpiring() falla → devuelve 500 con body de error
  it("returns 500 when getExpiring rejects", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetExpiring.mockRejectedValue(new Error("DB timeout"));
    const res = await GET(makeReq("https://host/api/batches/expiring"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  // 8. Verificar formato de respuesta: { data: [...], days: N }
  it("returns response with shape { data: array, days: number }", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetExpiring.mockResolvedValue([BATCH_EXPIRING]);
    const res = await GET(makeReq("https://host/api/batches/expiring?days=30"));
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("days", 30);
    expect(Array.isArray(body.data)).toBe(true);
  });

  // 9. Verificar que usa tenantId del auth
  it("calls getExpiring with tenantId from auth", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetExpiring.mockResolvedValue([]);
    await GET(makeReq("https://host/api/batches/expiring"));
    expect(mockGetExpiring).toHaveBeenCalledWith("main", 7);
  });

  // 10. Verificar que usa tenantId correcto con otro tenant
  it("calls getExpiring with correct tenantId for different tenant", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_TENANT2);
    mockGetExpiring.mockResolvedValue([]);
    await GET(makeReq("https://host/api/batches/expiring?days=3"));
    expect(mockGetExpiring).toHaveBeenCalledWith("sucursal-norte", 3);
  });

  // 11. ?days=texto → validación falla
  it("returns 400 when days is non-numeric string", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await GET(makeReq("https://host/api/batches/expiring?days=abc"));
    expect(res.status).toBe(400);
  });

  // 12. Resultado vacío → data array vacío
  it("returns empty data array when no batches are expiring", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockGetExpiring.mockResolvedValue([]);
    const res = await GET(makeReq("https://host/api/batches/expiring"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.days).toBe(7);
  });
});
