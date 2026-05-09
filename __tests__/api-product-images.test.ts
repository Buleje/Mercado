/**
 * Tests unitarios — /api/marketplace/products/[id]/images
 *
 * GET: no requiere auth, usa x-tenant-id header
 * POST/DELETE: requireAdmin con ["admin", "almacenero"]
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

vi.mock("@/lib/url-allowlist", () => ({
  isAllowedImageUrl: vi.fn(() => true),
}));

const { mockProductFindFirst } = vi.hoisted(() => ({ mockProductFindFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findFirst: mockProductFindFirst },
  },
}));

const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

const { mockInvalidateByPrefix } = vi.hoisted(() => ({ mockInvalidateByPrefix: vi.fn() }));
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  invalidate: vi.fn(),
  invalidateByPrefix: mockInvalidateByPrefix,
}));

const { mockList, mockCreate, mockDelete } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockDelete: vi.fn(),
}));
vi.mock("@/lib/db/product-images.db", () => ({
  ProductImagesDB: { list: mockList, create: mockCreate, delete: mockDelete },
}));

import { GET, POST, DELETE } from "@/app/api/marketplace/products/[id]/images/route";

const AUTH = { tenantId: "test-tenant", role: "admin", username: "tester" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

const IMG_1 = {
  id: "img-1", productId: 42, url: "https://example.com/img1.jpg",
  alt: "Front", position: 0, isPrimary: true,
  tenantId: "test-tenant", createdAt: "2026-01-01T00:00:00.000Z",
};
const IMG_2 = { ...IMG_1, id: "img-2", position: 1, isPrimary: false };
const IMG_3 = { ...IMG_1, id: "img-3", position: 2, isPrimary: false };

function makeParams(id = "42") {
  return { params: Promise.resolve({ id }) };
}

function makeGetReq(id = "42", tenantId = "test-tenant") {
  return new NextRequest(`https://host/api/marketplace/products/${id}/images`, {
    headers: { "x-tenant-id": tenantId },
  });
}

function makePostReq(body: unknown) {
  return new NextRequest("https://host/api/marketplace/products/42/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteReq(imageId?: string) {
  const url = imageId
    ? `https://host/api/marketplace/products/42/images?imageId=${imageId}`
    : "https://host/api/marketplace/products/42/images";
  return new NextRequest(url, { method: "DELETE" });
}

// ── GET ───────────────────────────────────────────────────────────────────────

describe("GET /api/marketplace/products/[id]/images", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna lista vacía cuando el producto no tiene imágenes", async () => {
    mockList.mockResolvedValue([]);
    const res = await GET(makeGetReq(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
  });

  it("retorna 3 imágenes", async () => {
    mockList.mockResolvedValue([IMG_1, IMG_2, IMG_3]);
    const res = await GET(makeGetReq(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(3);
    expect(body.data[0].id).toBe("img-1");
  });

  it("multi-tenant: pasa el tenantId del header a la DB class", async () => {
    mockList.mockResolvedValue([]);
    await GET(makeGetReq("42", "tenant-a"), makeParams());
    expect(mockList).toHaveBeenCalledWith("tenant-a", 42);
  });

  it("retorna 400 si el id del producto no es numérico", async () => {
    const res = await GET(makeGetReq("abc"), makeParams("abc"));
    expect(res.status).toBe(400);
  });
});

// ── POST ──────────────────────────────────────────────────────────────────────

describe("POST /api/marketplace/products/[id]/images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockCreate.mockResolvedValue(IMG_1);
    mockProductFindFirst.mockResolvedValue({ id: 42 });
  });

  it("crea imagen con payload válido → 201", async () => {
    const res = await POST(makePostReq({ url: "https://example.com/img.jpg" }), makeParams());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("img-1");
  });

  it("retorna 401 si requireAdmin falla", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makePostReq({ url: "https://example.com/img.jpg" }), makeParams());
    expect(res.status).toBe(401);
  });

  it("retorna 400 si url es vacía", async () => {
    const res = await POST(makePostReq({ url: "" }), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  it("retorna 400 si url es malformada (no válida)", async () => {
    const res = await POST(makePostReq({ url: "not-a-url" }), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  it("retorna 400 si position es negativa", async () => {
    const res = await POST(
      makePostReq({ url: "https://example.com/img.jpg", position: -1 }),
      makeParams()
    );
    expect(res.status).toBe(400);
  });

  it("llama a invalidateByPrefix con la clave del producto", async () => {
    await POST(makePostReq({ url: "https://example.com/img.jpg" }), makeParams());
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith("marketplace:product:test-tenant:42");
  });

  it("usa el tenantId de auth (no de body) al crear", async () => {
    await POST(makePostReq({ url: "https://example.com/img.jpg" }), makeParams());
    expect(mockCreate).toHaveBeenCalledWith("test-tenant", expect.any(Object));
  });
});

// ── DELETE ────────────────────────────────────────────────────────────────────

describe("DELETE /api/marketplace/products/[id]/images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockDelete.mockResolvedValue(undefined);
    mockProductFindFirst.mockResolvedValue({ id: 42 });
  });

  it("elimina imagen → 200 { ok: true }", async () => {
    const res = await DELETE(makeDeleteReq("img-1"), makeParams());
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("llama a ProductImagesDB.delete con tenantId e imageId correctos", async () => {
    await DELETE(makeDeleteReq("img-1"), makeParams());
    expect(mockDelete).toHaveBeenCalledWith("test-tenant", "img-1");
  });

  it("retorna 400 si imageId no se provee en query", async () => {
    const res = await DELETE(makeDeleteReq(), makeParams());
    expect(res.status).toBe(400);
  });
});
