/**
 * API /api/batches – unit tests
 * Covers: auth failure, validation, GET list, POST create, PATCH update, DELETE
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

const { mockFindMany, mockCreate, mockFindFirst, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCreate: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    batch: {
      findMany: mockFindMany,
      create: mockCreate,
      findFirst: mockFindFirst,
      update: mockUpdate,
      delete: mockDelete,
    },
  },
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/batches/route";

const AUTH = { tenantId: "main", role: "admin", username: "test" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}

const NOW = new Date("2026-01-01T00:00:00Z");
const ENTRY = "2026-01-01T00:00:00.000Z";
const EXPIRY = "2027-01-01T00:00:00.000Z";
const BASE_BATCH = {
  id: "b1", tenantId: "main", lote: "LOT-001", productName: "Harina",
  productCategory: "Abarrotes", quantity: 100, unit: "kg",
  supplierId: null, supplierName: "Proveedor X",
  entryDate: new Date(ENTRY), expiryDate: new Date(EXPIRY),
  costUnit: 5.0, notes: "", createdAt: NOW, updatedAt: NOW,
};
const VALID_BODY = {
  lote: "LOT-001", productName: "Harina", quantity: 100,
  entryDate: ENTRY, expiryDate: EXPIRY,
};

// ── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/batches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(makeReq("GET", "https://host/api/batches"));
    expect(res.status).toBe(401);
  });

  it("returns empty array", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("GET", "https://host/api/batches"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns mapped batches with formatted dates", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindMany.mockResolvedValue([BASE_BATCH]);
    const res = await GET(makeReq("GET", "https://host/api/batches"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].lote).toBe("LOT-001");
    expect(body[0].entryDate).toBe("2026-01-01");
    expect(body[0].expiryDate).toBe("2027-01-01");
  });
});

// ── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/batches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makeReq("POST", "https://host/api/batches", VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing lote", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await POST(makeReq("POST", "https://host/api/batches", { productName: "Harina", quantity: 100, entryDate: ENTRY, expiryDate: EXPIRY }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on negative quantity", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await POST(makeReq("POST", "https://host/api/batches", { ...VALID_BODY, quantity: -1 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid entryDate (not ISO datetime)", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await POST(makeReq("POST", "https://host/api/batches", { ...VALID_BODY, entryDate: "01-01-2026" }));
    expect(res.status).toBe(400);
  });

  it("creates batch and returns 201", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockCreate.mockResolvedValue(BASE_BATCH);
    const res = await POST(makeReq("POST", "https://host/api/batches", VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.lote).toBe("LOT-001");
    expect(body.quantity).toBe(100);
  });
});

// ── PATCH ────────────────────────────────────────────────────────────────────

describe("PATCH /api/batches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when id is missing", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await PATCH(makeReq("PATCH", "https://host/api/batches", { quantity: 50 }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when batch not found", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindFirst.mockResolvedValue(null);
    const res = await PATCH(makeReq("PATCH", "https://host/api/batches?id=x", { quantity: 50 }));
    expect(res.status).toBe(404);
  });

  it("updates quantity and returns 200", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindFirst.mockResolvedValue(BASE_BATCH);
    mockUpdate.mockResolvedValue({ ...BASE_BATCH, quantity: 50 });
    const res = await PATCH(makeReq("PATCH", "https://host/api/batches?id=b1", { quantity: 50 }));
    expect(res.status).toBe(200);
    expect((await res.json()).quantity).toBe(50);
  });
});

// ── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/batches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when id is missing", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await DELETE(makeReq("DELETE", "https://host/api/batches"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when batch not found", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindFirst.mockResolvedValue(null);
    const res = await DELETE(makeReq("DELETE", "https://host/api/batches?id=x"));
    expect(res.status).toBe(404);
  });

  it("deletes and returns { ok: true }", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindFirst.mockResolvedValue(BASE_BATCH);
    mockDelete.mockResolvedValue({});
    const res = await DELETE(makeReq("DELETE", "https://host/api/batches?id=b1"));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
