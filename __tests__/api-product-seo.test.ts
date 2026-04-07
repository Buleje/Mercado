/**
 * Tests unitarios — /api/marketplace/products/[id]/seo
 *
 * GET: no requiere auth, usa x-tenant-id header, usa prisma directo
 * PUT: requireAdmin(["admin"]), valida metaTitle <= 70 chars, metaDescription <= 160 chars
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── requireAdmin ──────────────────────────────────────────────────────────────
const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

// ── cache ─────────────────────────────────────────────────────────────────────
const { mockInvalidateByPrefix } = vi.hoisted(() => ({ mockInvalidateByPrefix: vi.fn() }));
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  invalidate: vi.fn(),
  invalidateByPrefix: mockInvalidateByPrefix,
}));

// ── prisma ────────────────────────────────────────────────────────────────────
const { mockFindFirst, mockUpdateMany } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockUpdateMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findFirst: mockFindFirst, updateMany: mockUpdateMany },
  },
}));

import { GET, PUT } from "@/app/api/marketplace/products/[id]/seo/route";

const AUTH = { tenantId: "tenant-a", role: "admin", username: "tester" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

const SEO_DATA = {
  metaTitle: "Arroz Premium",
  metaDescription: "El mejor arroz de Pucallpa.",
  metaKeywordsJson: '["arroz","premium","pucallpa"]',
  ogImage: "https://example.com/img.jpg",
};

function makeGetReq(id = "42", tenantId = "tenant-a") {
  return new NextRequest(`https://host/api/marketplace/products/${id}/seo`, {
    headers: { "x-tenant-id": tenantId },
  });
}

function makePutReq(body: unknown) {
  return new NextRequest("https://host/api/marketplace/products/42/seo", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id = "42") {
  return { params: Promise.resolve({ id }) };
}

// ── GET ───────────────────────────────────────────────────────────────────────

describe("GET /api/marketplace/products/[id]/seo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue(SEO_DATA);
  });

  // 1. Retorna campos SEO del producto
  it("retorna campos SEO del producto", async () => {
    const res = await GET(makeGetReq(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metaTitle).toBe("Arroz Premium");
    expect(body.metaDescription).toBe("El mejor arroz de Pucallpa.");
    expect(Array.isArray(body.metaKeywords)).toBe(true);
    expect(body.metaKeywords).toContain("arroz");
    expect(body.ogImage).toBe("https://example.com/img.jpg");
  });

  // 7. Multi-tenant: usa x-tenant-id del header
  it("multi-tenant: pasa tenantId del header a prisma.findFirst", async () => {
    await GET(makeGetReq("42", "tenant-x"), makeParams());
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-x" }),
      })
    );
  });

  it("retorna 404 si el producto no existe", async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = await GET(makeGetReq(), makeParams());
    expect(res.status).toBe(404);
  });

  it("retorna 400 si id no es numérico", async () => {
    const res = await GET(makeGetReq("abc"), makeParams("abc"));
    expect(res.status).toBe(400);
  });
});

// ── PUT ───────────────────────────────────────────────────────────────────────

describe("PUT /api/marketplace/products/[id]/seo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockInvalidateByPrefix.mockResolvedValue(undefined);
  });

  // 4. PUT válido → 200
  it("actualización válida → 200 { ok: true }", async () => {
    const res = await PUT(
      makePutReq({ metaTitle: "Nuevo título", metaDescription: "Desc correcta" }),
      makeParams()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  // 2. metaTitle > 70 chars → 400
  it("metaTitle de 71 caracteres → 400", async () => {
    const res = await PUT(
      makePutReq({ metaTitle: "a".repeat(71) }),
      makeParams()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  // 3. metaDescription > 160 chars → 400
  it("metaDescription de 161 caracteres → 400", async () => {
    const res = await PUT(
      makePutReq({ metaDescription: "b".repeat(161) }),
      makeParams()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  // 5. PUT sin auth → 401
  it("retorna 401 si requireAdmin falla", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await PUT(makePutReq({ metaTitle: "Válido" }), makeParams());
    expect(res.status).toBe(401);
  });

  // 6. PUT partial (solo metaTitle) → solo pasa ese campo a prisma
  it("actualización parcial: solo metaTitle → prisma recibe solo ese campo", async () => {
    await PUT(makePutReq({ metaTitle: "Solo título" }), makeParams());
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { metaTitle: "Solo título" },
      })
    );
  });

  // 7. Multi-tenant: usa auth.tenantId en el where
  it("multi-tenant: updateMany usa auth.tenantId", async () => {
    await PUT(makePutReq({ metaTitle: "Algo" }), makeParams());
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-a" }),
      })
    );
  });

  // 8. ogImage URL inválida → 400
  it("ogImage URL inválida → 400", async () => {
    const res = await PUT(
      makePutReq({ ogImage: "no-es-una-url" }),
      makeParams()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  it("retorna 404 si el producto no existe (count=0)", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const res = await PUT(makePutReq({ metaTitle: "Algo" }), makeParams());
    expect(res.status).toBe(404);
  });
});
