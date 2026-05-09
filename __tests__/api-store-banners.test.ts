/**
 * Tests unitarios — /api/marketplace/stores/[slug]/banners (GET, POST)
 *                    /api/marketplace/stores/[slug]/banners/[bannerId] (PUT, DELETE)
 *
 * GET: no requiere auth, usa x-tenant-id header
 * POST/PUT/DELETE: requireAdmin(["admin"])
 * El endpoint usa prisma para resolver store por slug, luego StoreBannersDB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/url-allowlist", () => ({
  isAllowedImageUrl: vi.fn(() => true),
}));

// ── requireAdmin ──────────────────────────────────────────────────────────────
const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

// ── prisma (store resolver) ───────────────────────────────────────────────────
// findFirst — usado por POST/PUT/DELETE (admin path) que resuelven con tenantId.
// Wave 8 (2026-04-29): GET banners ahora usa MarketplaceStoresDB.getBySlug
// (filtra isPublished + cache compartido). POST sigue con prisma.store.findFirst
// porque el admin debe poder editar tiendas no publicadas / draft.
const { mockStoreFindFirst, mockStoreFindUnique, mockGetBySlug } = vi.hoisted(() => ({
  mockStoreFindFirst: vi.fn(),
  mockStoreFindUnique: vi.fn(),
  mockGetBySlug: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    store: {
      findFirst: mockStoreFindFirst,
      findUnique: mockStoreFindUnique,
    },
  },
}));
vi.mock("@/lib/db/marketplace.db", () => ({
  MarketplaceStoresDB: { getBySlug: mockGetBySlug },
}));

// ── StoreBannersDB ────────────────────────────────────────────────────────────
const { mockBList, mockBCreate, mockBUpdate, mockBDelete } = vi.hoisted(() => ({
  mockBList: vi.fn(),
  mockBCreate: vi.fn(),
  mockBUpdate: vi.fn(),
  mockBDelete: vi.fn(),
}));
vi.mock("@/lib/db/store-banners.db", () => ({
  StoreBannersDB: {
    list: mockBList,
    create: mockBCreate,
    update: mockBUpdate,
    delete: mockBDelete,
  },
}));

import {
  GET,
  POST,
} from "@/app/api/marketplace/stores/[slug]/banners/route";
import {
  PUT,
  DELETE,
} from "@/app/api/marketplace/stores/[slug]/banners/[bannerId]/route";

const AUTH = { tenantId: "tenant-a", role: "admin", username: "tester" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

const STORE = { id: "store-1", slug: "mi-tienda", tenantId: "tenant-a" };

const BANNER = {
  id: "banner-1",
  storeId: "store-1",
  title: "Oferta especial",
  subtitle: "Solo hoy",
  imageUrl: "https://example.com/banner.jpg",
  linkUrl: null,
  position: 0,
  section: "hero",
  isActive: true,
  startDate: null,
  endDate: null,
  tenantId: "tenant-a",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function makeGetReq(slug = "mi-tienda", tenantId = "tenant-a", section?: string) {
  const url = section
    ? `https://host/api/marketplace/stores/${slug}/banners?section=${section}`
    : `https://host/api/marketplace/stores/${slug}/banners`;
  return new NextRequest(url, { headers: { "x-tenant-id": tenantId } });
}

function makePostReq(body: unknown) {
  return new NextRequest("https://host/api/marketplace/stores/mi-tienda/banners", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePutReq(body: unknown) {
  return new NextRequest("https://host/api/marketplace/stores/mi-tienda/banners/banner-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteReq() {
  return new NextRequest("https://host/api/marketplace/stores/mi-tienda/banners/banner-1", {
    method: "DELETE",
  });
}

function makeSlugParams(slug = "mi-tienda") {
  return { params: Promise.resolve({ slug }) };
}

function makeBannerParams(slug = "mi-tienda", bannerId = "banner-1") {
  return { params: Promise.resolve({ slug, bannerId }) };
}

// ── GET ───────────────────────────────────────────────────────────────────────

describe("GET /api/marketplace/stores/[slug]/banners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Wave 8: GET ahora usa MarketplaceStoresDB.getBySlug (filtra isPublished
    // y cachea). El tenantId resuelto no depende del header x-tenant-id.
    mockGetBySlug.mockResolvedValue(STORE);
    mockStoreFindUnique.mockResolvedValue(STORE);
    mockBList.mockResolvedValue([BANNER]);
  });

  // 1. GET retorna banners activos
  it("retorna lista de banners activos", async () => {
    const res = await GET(makeGetReq(), makeSlugParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.banners).toHaveLength(1);
    expect(body.banners[0].id).toBe("banner-1");
  });

  // 2. GET filtra por section=hero
  it("pasa section=hero al DB list", async () => {
    await GET(makeGetReq("mi-tienda", "tenant-a", "hero"), makeSlugParams());
    expect(mockBList).toHaveBeenCalledWith("tenant-a", "store-1", "hero");
  });

  // 8. Cross-tenant: el GET resuelve store por slug global, no por header
  it("cross-tenant: resuelve store solo por slug ignorando x-tenant-id", async () => {
    await GET(makeGetReq("mi-tienda", "tenant-b"), makeSlugParams());
    expect(mockGetBySlug).toHaveBeenCalledWith("mi-tienda");
    // Despues delega al tenantId REAL del store (tenant-a) no al header (tenant-b)
    expect(mockBList).toHaveBeenCalledWith("tenant-a", "store-1", undefined);
  });

  it("devuelve banners vacios resilient cuando la tienda no existe", async () => {
    // El handler GET es resilient (cross-tenant marketplace): si no encuentra
    // el store devuelve { banners: [] } con 200, no 404, para no romper la UI.
    mockGetBySlug.mockResolvedValue(null);
    mockStoreFindUnique.mockResolvedValue(null);
    const res = await GET(makeGetReq(), makeSlugParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.banners).toEqual([]);
  });

  // 9. Banner con endDate pasado → excluido del list
  // La lógica de filtro por fecha está en StoreBannersDB.list (se hace en prisma),
  // por eso testeamos que el endpoint devuelve lo que la DB retorna (que ya filtra)
  it("devuelve solo banners que la DB list retorna (filtra por fecha en la DB)", async () => {
    mockBList.mockResolvedValue([]); // DB ya filtró los expirados
    const res = await GET(makeGetReq(), makeSlugParams());
    const body = await res.json();
    expect(body.banners).toHaveLength(0);
  });
});

// ── POST ──────────────────────────────────────────────────────────────────────

describe("POST /api/marketplace/stores/[slug]/banners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockStoreFindFirst.mockResolvedValue(STORE);
    mockBCreate.mockResolvedValue(BANNER);
  });

  // 3. POST crea banner
  it("crea banner con payload válido → 201", async () => {
    const res = await POST(
      makePostReq({
        title: "Banner nuevo",
        imageUrl: "https://example.com/img.jpg",
      }),
      makeSlugParams()
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.banner.id).toBe("banner-1");
  });

  // 4. POST sin title → 400
  it("sin title → 400", async () => {
    const res = await POST(
      makePostReq({ imageUrl: "https://example.com/img.jpg" }),
      makeSlugParams()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  // 5. POST imageUrl no URL → 400
  it("imageUrl no es URL válida → 400", async () => {
    const res = await POST(
      makePostReq({ title: "Banner", imageUrl: "no-es-url" }),
      makeSlugParams()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  it("sin auth → 401", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(
      makePostReq({ title: "Banner", imageUrl: "https://example.com/img.jpg" }),
      makeSlugParams()
    );
    expect(res.status).toBe(401);
  });
});

// ── PUT ───────────────────────────────────────────────────────────────────────

describe("PUT /api/marketplace/stores/[slug]/banners/[bannerId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockBUpdate.mockResolvedValue({ ...BANNER, title: "Actualizado" });
  });

  // 6. PUT actualiza
  it("actualiza banner → 200 con banner actualizado", async () => {
    const res = await PUT(makePutReq({ title: "Actualizado" }), makeBannerParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.banner.title).toBe("Actualizado");
  });

  it("sin auth → 401", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await PUT(makePutReq({ title: "Algo" }), makeBannerParams());
    expect(res.status).toBe(401);
  });

  it("banner no encontrado → 404", async () => {
    mockBUpdate.mockResolvedValue(null);
    const res = await PUT(makePutReq({ title: "Algo" }), makeBannerParams());
    expect(res.status).toBe(404);
  });
});

// ── DELETE ─────────────────────────────────────────────────────────────────────

describe("DELETE /api/marketplace/stores/[slug]/banners/[bannerId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockBDelete.mockResolvedValue(undefined);
  });

  // 7. DELETE
  it("elimina banner → 200 { ok: true }", async () => {
    const res = await DELETE(makeDeleteReq(), makeBannerParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("llama StoreBannersDB.delete con tenantId y bannerId correctos", async () => {
    await DELETE(makeDeleteReq(), makeBannerParams());
    expect(mockBDelete).toHaveBeenCalledWith("tenant-a", "banner-1");
  });

  it("sin auth → 401", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await DELETE(makeDeleteReq(), makeBannerParams());
    expect(res.status).toBe(401);
  });
});
