/**
 * Tests unitarios — /api/marketplace/stores/[slug]
 *
 * Cubre:
 *  - GET tienda por slug — tienda publicada (200)
 *  - GET tienda por slug — tienda NO publicada (404)
 *  - GET tienda por slug — slug no existe (404)
 *  - Productos de la tienda /[slug]/products (200)
 *  - Productos con filtros: category, search, sort
 *  - Tienda no publicada → 404 en /[slug]/products
 *  - Error de BD → 500
 *
 * Endpoints PÚBLICOS.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  getOrSet: vi.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  invalidate: vi.fn(),
}));

// ── Mock: api-error ───────────────────────────────────────────────────────────

const { MockNotFoundError } = vi.hoisted(() => {
  class MockNotFoundError extends Error {
    constructor(m: string) {
      super(m);
      this.name = "NotFoundError";
    }
  }
  return { MockNotFoundError };
});

vi.mock("@/lib/api-error", () => ({
  toErrorPayload: vi.fn((err: unknown, _traceId: string) => {
    if (err instanceof MockNotFoundError || (err as { name?: string }).name === "NotFoundError") {
      return { payload: { error: "Not found" }, status: 404 };
    }
    return { payload: { error: "Internal error" }, status: 500 };
  }),
  newTraceId: vi.fn(() => "trace-slug-789"),
  NotFoundError: MockNotFoundError,
}));

// ── Mock: prisma + lib/db/marketplace ─────────────────────────────────────────
// Wave 8: el endpoint products usa MarketplaceStoresDB.getBySlug (caché +
// filtro isPublished). El endpoint /stores/[slug] sigue con prisma directo
// porque necesita columnas pendientes de migration (vacationMode).
const { mockStoreFindUnique, mockStoreProductFindMany, mockStoreFindUniqueForProducts, mockGetBySlug, mockListForStorefront } = vi.hoisted(() => ({
  mockStoreFindUnique:             vi.fn(),
  mockStoreProductFindMany:        vi.fn(),
  mockStoreFindUniqueForProducts:  vi.fn(),
  mockGetBySlug:                   vi.fn(),
  mockListForStorefront:           vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    store: {
      findUnique: mockStoreFindUnique,
    },
    storeProduct: {
      findMany: mockStoreProductFindMany,
    },
  },
}));

vi.mock("@/lib/db/marketplace.db", () => ({
  MarketplaceStoresDB:        { getBySlug: mockGetBySlug },
  MarketplaceStoreProductsDB: { listForStorefront: mockListForStorefront },
}));

import { GET as GETStore }    from "@/app/api/marketplace/stores/[slug]/route";
import { GET as GETProducts } from "@/app/api/marketplace/stores/[slug]/products/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(url: string): NextRequest {
  return new NextRequest(url);
}

function makeParams(slug: string): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const STORE_PUBLISHED = {
  id:          "store-1",
  slug:        "bodega-san-martin",
  name:        "Buleje",
  description: "La mejor bodega",
  logo:        "/logo.png",
  banner:      "/banner.png",
  category:    "Abarrotes",
  zone:        "Centro",
  rating:      4.8,
  reviewCount: 120,
  isPublished: true,
  createdAt:   new Date("2026-01-01"),
  _count:      { products: 32 },
};

const STORE_UNPUBLISHED = {
  ...STORE_PUBLISHED,
  slug:        "tienda-oculta",
  isPublished: false,
};

const PRODUCT_ARROZ = {
  id:             "sp-1",
  retailPrice:    3.5,
  wholesalePrice: 3.0,
  minOrderQty:    1,
  product: {
    id:       "prod-1",
    name:     "Arroz Extra",
    image:    "/arroz.png",
    category: "Abarrotes",
    unit:     "kg",
    description: "Arroz de calidad",
  },
};

const PRODUCT_ACEITE = {
  id:             "sp-2",
  retailPrice:    8.5,
  wholesalePrice: 7.0,
  minOrderQty:    1,
  product: {
    id:       "prod-2",
    name:     "Aceite Vegetal",
    image:    "/aceite.png",
    category: "Aceites",
    unit:     "lt",
    description: "Aceite de cocina",
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Tests: GET /api/marketplace/stores/[slug]
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/marketplace/stores/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna datos de tienda publicada (200)", async () => {
    mockStoreFindUnique.mockResolvedValue(STORE_PUBLISHED);

    const res  = await GETStore(makeReq("https://host/api/marketplace/stores/bodega-san-martin"), makeParams("bodega-san-martin"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.slug).toBe("bodega-san-martin");
    expect(body.data.name).toBe("Buleje");
    expect(body.data._count.products).toBe(32);
  });

  it("retorna 404 si la tienda no existe (findUnique → null)", async () => {
    mockStoreFindUnique.mockResolvedValue(null);

    const res = await GETStore(makeReq("https://host/api/marketplace/stores/no-existe"), makeParams("no-existe"));

    expect(res.status).toBe(404);
  });

  it("retorna 404 si la tienda existe pero NO está publicada", async () => {
    mockStoreFindUnique.mockResolvedValue(STORE_UNPUBLISHED);

    const res = await GETStore(makeReq("https://host/api/marketplace/stores/tienda-oculta"), makeParams("tienda-oculta"));

    expect(res.status).toBe(404);
  });

  it("busca la tienda usando el slug como where clause", async () => {
    mockStoreFindUnique.mockResolvedValue(STORE_PUBLISHED);

    await GETStore(makeReq("https://host/api/marketplace/stores/bodega-san-martin"), makeParams("bodega-san-martin"));

    expect(mockStoreFindUnique.mock.calls[0][0].where).toMatchObject({ slug: "bodega-san-martin" });
  });

  it("la respuesta incluye conteo de productos activos", async () => {
    mockStoreFindUnique.mockResolvedValue(STORE_PUBLISHED);

    const res  = await GETStore(makeReq("https://host/api/marketplace/stores/bodega-san-martin"), makeParams("bodega-san-martin"));
    const body = await res.json();

    expect(body.data._count).toHaveProperty("products");
    expect(typeof body.data._count.products).toBe("number");
  });

  it("retorna 500 si Prisma lanza excepción", async () => {
    mockStoreFindUnique.mockRejectedValue(new Error("DB crashed"));

    const res = await GETStore(makeReq("https://host/api/marketplace/stores/bodega-san-martin"), makeParams("bodega-san-martin"));

    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests: GET /api/marketplace/stores/[slug]/products
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/marketplace/stores/[slug]/products", () => {
  // Audit 2026-05-19: endpoint migrado a MarketplaceStoreProductsDB.listForStorefront.
  // Los tests asertan sobre opts pasados a la DB class, no sobre llamadas a Prisma.

  // Shape devuelto por listForStorefront (flat, sin wholesalePrice).
  const PROD_ARROZ_FLAT  = { id: 1, storeProductId: "sp-1", name: "Arroz Extra",   price: 3.5, minOrderQty: 1, image: "/arroz.png",  category: "Abarrotes", unit: "kg", stock: 20 };
  const PROD_ACEITE_FLAT = { id: 2, storeProductId: "sp-2", name: "Aceite Vegetal", price: 8.5, minOrderQty: 1, image: "/aceite.png", category: "Aceites",   unit: "lt", stock: 10 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockListForStorefront.mockResolvedValue({ products: [], nextCursor: null });
  });

  it("retorna productos de tienda publicada (200)", async () => {
    mockGetBySlug.mockResolvedValue({ id: "store-1", isPublished: true });
    mockListForStorefront.mockResolvedValue({ products: [PROD_ARROZ_FLAT, PROD_ACEITE_FLAT], nextCursor: null });

    const res  = await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products"), makeParams("bodega-san-martin"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
  });

  it("retorna 404 si la tienda no existe", async () => {
    mockGetBySlug.mockResolvedValue(null);

    const res = await GETProducts(makeReq("https://host/api/marketplace/stores/noexiste/products"), makeParams("noexiste"));

    expect(res.status).toBe(404);
  });

  it("retorna 404 si la tienda no está publicada (getBySlug devuelve null)", async () => {
    mockGetBySlug.mockResolvedValue(null);

    const res = await GETProducts(makeReq("https://host/api/marketplace/stores/tienda-oculta/products"), makeParams("tienda-oculta"));

    expect(res.status).toBe(404);
  });

  it("filtra por category — pasa opts.category a listForStorefront", async () => {
    mockGetBySlug.mockResolvedValue({ id: "store-1", isPublished: true });
    mockListForStorefront.mockResolvedValue({ products: [PROD_ARROZ_FLAT], nextCursor: null });

    await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products?category=Abarrotes"), makeParams("bodega-san-martin"));

    expect(mockListForStorefront).toHaveBeenCalledWith(
      "store-1",
      expect.objectContaining({ category: "Abarrotes" }),
    );
  });

  it("filtra por search — pasa opts.search a listForStorefront", async () => {
    mockGetBySlug.mockResolvedValue({ id: "store-1", isPublished: true });
    mockListForStorefront.mockResolvedValue({ products: [PROD_ARROZ_FLAT], nextCursor: null });

    await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products?search=arroz"), makeParams("bodega-san-martin"));

    expect(mockListForStorefront).toHaveBeenCalledWith(
      "store-1",
      expect.objectContaining({ search: "arroz" }),
    );
  });

  it("sort=price_asc — pasa opts.sort a listForStorefront", async () => {
    mockGetBySlug.mockResolvedValue({ id: "store-1", isPublished: true });

    await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products?sort=price_asc"), makeParams("bodega-san-martin"));

    expect(mockListForStorefront).toHaveBeenCalledWith(
      "store-1",
      expect.objectContaining({ sort: "price_asc" }),
    );
  });

  it("sort=price_desc — pasa opts.sort a listForStorefront", async () => {
    mockGetBySlug.mockResolvedValue({ id: "store-1", isPublished: true });

    await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products?sort=price_desc"), makeParams("bodega-san-martin"));

    expect(mockListForStorefront).toHaveBeenCalledWith(
      "store-1",
      expect.objectContaining({ sort: "price_desc" }),
    );
  });

  it("retorna 400 si sort tiene valor inválido", async () => {
    mockGetBySlug.mockResolvedValue({ id: "store-1", isPublished: true });

    const res = await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products?sort=invalid"), makeParams("bodega-san-martin"));

    expect(res.status).toBe(400);
  });

  it("SOLO retorna productos isActive:true (responsabilidad de la DB class)", async () => {
    // El filtro isActive:true vive en MarketplaceStoreProductsDB.listForStorefront
    // (no se expone al endpoint). El test confirma el contrato: si la DB class
    // devuelve productos, el endpoint los retorna sin filtrarlos adicionalmente.
    mockGetBySlug.mockResolvedValue({ id: "store-1", isPublished: true });
    mockListForStorefront.mockResolvedValue({ products: [PROD_ARROZ_FLAT], nextCursor: null });

    const res = await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products"), makeParams("bodega-san-martin"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });

  it("productos van filtrados al storeId de la tienda buscada", async () => {
    mockGetBySlug.mockResolvedValue({ id: "store-1", isPublished: true });

    await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products"), makeParams("bodega-san-martin"));

    // El endpoint pasa el storeId (no el slug) a la DB class.
    expect(mockListForStorefront).toHaveBeenCalledWith("store-1", expect.any(Object));
  });

  it("retorna 500 si la DB class lanza excepción en productos", async () => {
    mockGetBySlug.mockResolvedValue({ id: "store-1", isPublished: true });
    mockListForStorefront.mockRejectedValue(new Error("DB error"));

    const res = await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products"), makeParams("bodega-san-martin"));

    expect(res.status).toBe(500);
  });
});
