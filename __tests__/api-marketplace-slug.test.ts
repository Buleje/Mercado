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

// ── Mock: api-error ───────────────────────────────────────────────────────────
// Nota: vi.mock se hoistea al tope del archivo, así que NotFoundError debe
// vivir dentro de vi.hoisted() para estar disponible cuando el mock factory
// corre. Si se declara como top-level `class`, la hoisting lo deja undefined.

const { NotFoundError } = vi.hoisted(() => {
  class NotFoundError extends Error {
    constructor(m: string) {
      super(m);
      this.name = "NotFoundError";
    }
  }
  return { NotFoundError };
});

// Bypass del cache — el handler usa getOrSet() que persiste entre tests y
// hace que las llamadas a los mocks de Prisma nunca ocurran en tests
// subsecuentes. Al mockear getOrSet para que siempre invoque la función
// factory, cada test ve la invocación fresca.
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(async (_key: string, _ttl: number, fn: () => unknown) => {
    return await fn();
  }),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));

vi.mock("@/lib/api-error", () => ({
  toErrorPayload: vi.fn((err: unknown, _traceId: string) => {
    if (err instanceof NotFoundError || (err as { name?: string }).name === "NotFoundError") {
      return { payload: { error: "Not found" }, status: 404 };
    }
    return { payload: { error: "Internal error" }, status: 500 };
  }),
  newTraceId: vi.fn(() => "trace-slug-789"),
  NotFoundError,
}));

// ── Mock: prisma ───────────────────────────────────────────────────────────────
const { mockStoreFindUnique, mockStoreProductFindMany, mockStoreFindUniqueForProducts } = vi.hoisted(() => ({
  mockStoreFindUnique:             vi.fn(),
  mockStoreProductFindMany:        vi.fn(),
  mockStoreFindUniqueForProducts:  vi.fn(),
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
  name:        "Bodega San Martín",
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
    expect(body.data.name).toBe("Bodega San Martín");
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna productos de tienda publicada (200)", async () => {
    // Primera llamada: verificar tienda existe y está publicada
    mockStoreFindUnique.mockResolvedValue({ id: "store-1", isPublished: true });
    mockStoreProductFindMany.mockResolvedValue([PRODUCT_ARROZ, PRODUCT_ACEITE]);

    const res  = await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products"), makeParams("bodega-san-martin"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
  });

  it("retorna 404 si la tienda no existe", async () => {
    mockStoreFindUnique.mockResolvedValue(null);

    const res = await GETProducts(makeReq("https://host/api/marketplace/stores/noexiste/products"), makeParams("noexiste"));

    expect(res.status).toBe(404);
  });

  it("retorna 404 si la tienda no está publicada", async () => {
    mockStoreFindUnique.mockResolvedValue({ id: "store-2", isPublished: false });

    const res = await GETProducts(makeReq("https://host/api/marketplace/stores/tienda-oculta/products"), makeParams("tienda-oculta"));

    expect(res.status).toBe(404);
  });

  it("filtra por category", async () => {
    mockStoreFindUnique.mockResolvedValue({ id: "store-1", isPublished: true });
    mockStoreProductFindMany.mockResolvedValue([PRODUCT_ARROZ]);

    await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products?category=Abarrotes"), makeParams("bodega-san-martin"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    expect(callArgs.where.product.category).toBe("Abarrotes");
  });

  it("filtra por search (nombre de producto insensitive)", async () => {
    mockStoreFindUnique.mockResolvedValue({ id: "store-1", isPublished: true });
    mockStoreProductFindMany.mockResolvedValue([PRODUCT_ARROZ]);

    await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products?search=arroz"), makeParams("bodega-san-martin"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    expect(callArgs.where.product.name).toMatchObject({ contains: "arroz", mode: "insensitive" });
  });

  it("ordena por precio ascendente con sort=price_asc", async () => {
    mockStoreFindUnique.mockResolvedValue({ id: "store-1", isPublished: true });
    mockStoreProductFindMany.mockResolvedValue([]);

    await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products?sort=price_asc"), makeParams("bodega-san-martin"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    // El handler usa orderBy en array con tiebreaker por id para cursor
    // pagination estable: [{ retailPrice: 'asc' }, { id: 'asc' }].
    expect(callArgs.orderBy).toEqual([
      { retailPrice: "asc" },
      { id: "asc" },
    ]);
  });

  it("ordena por precio descendente con sort=price_desc", async () => {
    mockStoreFindUnique.mockResolvedValue({ id: "store-1", isPublished: true });
    mockStoreProductFindMany.mockResolvedValue([]);

    await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products?sort=price_desc"), makeParams("bodega-san-martin"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual([
      { retailPrice: "desc" },
      { id: "asc" },
    ]);
  });

  it("retorna 400 si sort tiene valor inválido", async () => {
    mockStoreFindUnique.mockResolvedValue({ id: "store-1", isPublished: true });

    const res = await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products?sort=invalid"), makeParams("bodega-san-martin"));

    expect(res.status).toBe(400);
  });

  it("SOLO retorna productos isActive:true (no expone inactivos)", async () => {
    mockStoreFindUnique.mockResolvedValue({ id: "store-1", isPublished: true });
    mockStoreProductFindMany.mockResolvedValue([PRODUCT_ARROZ]);

    await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products"), makeParams("bodega-san-martin"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    expect(callArgs.where.isActive).toBe(true);
  });

  it("productos van filtrados al storeId de la tienda buscada", async () => {
    mockStoreFindUnique.mockResolvedValue({ id: "store-1", isPublished: true });
    mockStoreProductFindMany.mockResolvedValue([]);

    await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products"), makeParams("bodega-san-martin"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    expect(callArgs.where.storeId).toBe("store-1");
  });

  it("retorna 500 si Prisma lanza excepción en productos", async () => {
    mockStoreFindUnique.mockResolvedValue({ id: "store-1", isPublished: true });
    mockStoreProductFindMany.mockRejectedValue(new Error("DB error"));

    const res = await GETProducts(makeReq("https://host/api/marketplace/stores/bodega-san-martin/products"), makeParams("bodega-san-martin"));

    expect(res.status).toBe(500);
  });
});
