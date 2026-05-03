/**
 * Tests unitarios — /api/marketplace/products/[id]/variants
 *
 * GET: no requiere auth, usa x-tenant-id header
 * POST/PUT/DELETE: requireAdmin con ["admin", "almacenero"]
 * attributesJson max 50000 chars (permite imageData WebP comprimida embebida)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api-error", () => ({
  toErrorPayload: vi.fn((err: unknown, _traceId: string) => ({
    payload: { error: err instanceof Error ? err.message : "Internal error" },
    status: 500,
  })),
  newTraceId: vi.fn(() => "trace-test-123"),
}));

const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));

const { mockVList, mockVCreate, mockVUpdate, mockVDelete } = vi.hoisted(() => ({
  mockVList: vi.fn(),
  mockVCreate: vi.fn(),
  mockVUpdate: vi.fn(),
  mockVDelete: vi.fn(),
}));
vi.mock("@/lib/db/product-variants.db", () => ({
  ProductVariantsDB: {
    list: mockVList,
    create: mockVCreate,
    update: mockVUpdate,
    delete: mockVDelete,
  },
}));

import { GET, POST, PUT, DELETE } from "@/app/api/marketplace/products/[id]/variants/route";

const AUTH = { tenantId: "test-tenant", role: "admin", username: "tester" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

const VARIANT_ROJO = {
  id: "var-1", productId: 42, name: "Rojo - S", sku: null,
  priceModifier: 0, stock: 10,
  attributesJson: JSON.stringify({ color: "rojo" }),
  isActive: true, position: 0, tenantId: "test-tenant",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeParams(id = "42") {
  return { params: Promise.resolve({ id }) };
}

function makeGetReq(id = "42", tenantId = "test-tenant") {
  return new NextRequest(`https://host/api/marketplace/products/${id}/variants`, {
    headers: { "x-tenant-id": tenantId },
  });
}

function makePostReq(body: unknown) {
  return new NextRequest("https://host/api/marketplace/products/42/variants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePutReq(body: unknown, variantId = "var-1") {
  return new NextRequest(`https://host/api/marketplace/products/42/variants?variantId=${variantId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteReq(variantId?: string) {
  const url = variantId
    ? `https://host/api/marketplace/products/42/variants?variantId=${variantId}`
    : "https://host/api/marketplace/products/42/variants";
  return new NextRequest(url, { method: "DELETE" });
}

// ── GET ───────────────────────────────────────────────────────────────────────

describe("GET /api/marketplace/products/[id]/variants", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna variantes activas (la DB class filtra isActive=true internamente)", async () => {
    mockVList.mockResolvedValue([VARIANT_ROJO]);
    const res = await GET(makeGetReq(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].isActive).toBe(true);
  });

  it("retorna lista vacía si no hay variantes activas", async () => {
    mockVList.mockResolvedValue([]);
    const res = await GET(makeGetReq(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
  });

  it("multi-tenant: pasa el tenantId del header a la DB class", async () => {
    mockVList.mockResolvedValue([]);
    await GET(makeGetReq("42", "tenant-b"), makeParams());
    expect(mockVList).toHaveBeenCalledWith("tenant-b", 42);
  });
});

// ── POST ──────────────────────────────────────────────────────────────────────

describe("POST /api/marketplace/products/[id]/variants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockVCreate.mockResolvedValue(VARIANT_ROJO);
  });

  it("crea variante con priceModifier negativo (descuento) → 201", async () => {
    mockVCreate.mockResolvedValue({ ...VARIANT_ROJO, priceModifier: -5 });
    const res = await POST(makePostReq({ name: "Oferta", priceModifier: -5 }), makeParams());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.priceModifier).toBe(-5);
  });

  it("crea variante con stock 0 (agotada) → 201", async () => {
    mockVCreate.mockResolvedValue({ ...VARIANT_ROJO, stock: 0 });
    const res = await POST(makePostReq({ name: "Agotada", priceModifier: 0, stock: 0 }), makeParams());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.stock).toBe(0);
  });

  it("retorna 400 si name es vacío", async () => {
    const res = await POST(makePostReq({ name: "" }), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  it("retorna 400 si name no se provee", async () => {
    const res = await POST(makePostReq({ priceModifier: 0 }), makeParams());
    expect(res.status).toBe(400);
  });

  it("crea variante con attributesJson válido (color) → 201", async () => {
    const attrs = JSON.stringify({ color: "verde" });
    const res = await POST(makePostReq({ name: "Verde", priceModifier: 0, attributesJson: attrs }), makeParams());
    expect(res.status).toBe(201);
  });

  it("retorna 400 si attributesJson supera 50000 chars", async () => {
    const largeAttrs = "x".repeat(50001);
    const res = await POST(makePostReq({ name: "Variante", priceModifier: 0, attributesJson: largeAttrs }), makeParams());
    expect(res.status).toBe(400);
  });

  it("retorna 401 sin auth", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makePostReq({ name: "Variante", priceModifier: 0 }), makeParams());
    expect(res.status).toBe(401);
  });

  it("usa tenantId de auth al crear (no acepta tenantId de body)", async () => {
    const res = await POST(makePostReq({ name: "Variante", priceModifier: 0 }), makeParams());
    expect(res.status).toBe(201);
    expect(mockVCreate).toHaveBeenCalledWith("test-tenant", expect.any(Object));
  });
});

// ── PUT ───────────────────────────────────────────────────────────────────────

describe("PUT /api/marketplace/products/[id]/variants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
  });

  it("actualiza priceModifier → 200", async () => {
    mockVUpdate.mockResolvedValue({ ...VARIANT_ROJO, priceModifier: 3 });
    const res = await PUT(makePutReq({ priceModifier: 3 }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.priceModifier).toBe(3);
  });

  it("retorna 404 si la variante no pertenece al tenant (update retorna null)", async () => {
    mockVUpdate.mockResolvedValue(null);
    const res = await PUT(makePutReq({ priceModifier: 3 }, "var-extranjera"), makeParams());
    expect(res.status).toBe(404);
  });

  it("retorna 400 si variantId no se provee", async () => {
    const req = new NextRequest("https://host/api/marketplace/products/42/variants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceModifier: 3 }),
    });
    const res = await PUT(req, makeParams());
    expect(res.status).toBe(400);
  });
});

// ── DELETE ────────────────────────────────────────────────────────────────────

describe("DELETE /api/marketplace/products/[id]/variants (soft delete)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockVDelete.mockResolvedValue(undefined);
  });

  it("soft delete: llama ProductVariantsDB.delete con tenantId y variantId", async () => {
    const res = await DELETE(makeDeleteReq("var-1"), makeParams());
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(mockVDelete).toHaveBeenCalledWith("test-tenant", "var-1");
  });

  it("retorna 400 si variantId no se provee", async () => {
    const res = await DELETE(makeDeleteReq(), makeParams());
    expect(res.status).toBe(400);
  });
});
