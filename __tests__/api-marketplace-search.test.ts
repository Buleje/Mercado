/**
 * Tests unitarios — /api/marketplace/search
 *
 * Cubre:
 *  - GET búsqueda cross-tienda (200) con resultados
 *  - Query requerido — sin 'q' retorna 400
 *  - Query mínimo 1 caracter, máximo 100
 *  - Filtro adicional por zone
 *  - Filtro adicional por category
 *  - Lista vacía si no hay coincidencias
 *  - Error de BD (500)
 *  - Cada resultado trae precio, producto y tienda
 *
 * Endpoint PÚBLICO — sin autenticación.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/api-error", () => ({
  toErrorPayload: vi.fn((err: unknown, _traceId: string) => ({
    payload: { error: err instanceof Error ? err.message : "Internal error" },
    status:  500,
  })),
  newTraceId: vi.fn(() => "trace-search-456"),
}));

// ── Mock: prisma ───────────────────────────────────────────────────────────────
// El handler hace batchProductEnrichment que consulta 4 modelos adicionales en
// paralelo (productImage, productVariant, review, orderItem) — hay que mockear
// los 5 para que el test no explote con "undefined.map".
const {
  mockStoreProductFindMany,
  mockProductImageFindMany,
  mockProductVariantGroupBy,
  mockReviewGroupBy,
  mockOrderItemGroupBy,
} = vi.hoisted(() => ({
  mockStoreProductFindMany: vi.fn(),
  mockProductImageFindMany: vi.fn(),
  mockProductVariantGroupBy: vi.fn(),
  mockReviewGroupBy: vi.fn(),
  mockOrderItemGroupBy: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    storeProduct: {
      findMany: mockStoreProductFindMany,
    },
    productImage: {
      findMany: mockProductImageFindMany,
    },
    productVariant: {
      groupBy: mockProductVariantGroupBy,
    },
    review: {
      groupBy: mockReviewGroupBy,
    },
    orderItem: {
      groupBy: mockOrderItemGroupBy,
    },
  },
}));

// Mock SearchSuggestionsDB — el handler:
//  - llama .record() fire-and-forget después de cada búsqueda
//  - llama .getProductFuzzyMatches() + .getDidYouMean() si no hay resultados
vi.mock("@/lib/db/search-suggestions.db", () => ({
  SearchSuggestionsDB: {
    record: vi.fn().mockResolvedValue(undefined),
    getProductFuzzyMatches: vi.fn().mockResolvedValue([]),
    getDidYouMean: vi.fn().mockResolvedValue([]),
  },
}));

// Mock sponsored-ranker — aplica boosts a productos. Firma: (tenantId, products).
vi.mock("@/lib/marketplace/sponsored-ranker", () => ({
  applyBoostsToProducts: vi.fn(
    (_tenantId: string, products: unknown[]) => products
  ),
}));

import { GET } from "@/app/api/marketplace/search/route";

// ── Fixtures ───────────────────────────────────────────────────────────────────

// Fixtures con la estructura que retorna Prisma al handler (relaciones en camelCase)
const RESULT_ARROZ = {
  id:          "sp-1",
  retailPrice: 3.5,
  minOrderQty: 1,
  product: {
    id:       1,
    name:     "Arroz Extra",
    image:    "/arroz.png",
    category: "Abarrotes",
    unit:     "kg",
  },
  store: {
    id:     "store-1",
    name:   "Buleje",
    slug:   "bodega-san-martin",
    logo:   "/logo.png",
    zone:   "Centro",
    rating: 4.5,
  },
};

const RESULT_ARROZ_LARGO = {
  id:          "sp-2",
  retailPrice: 4.0,
  minOrderQty: 2,
  product: {
    id:       2,
    name:     "Arroz Largo",
    image:    "/arroz-largo.png",
    category: "Abarrotes",
    unit:     "kg",
  },
  store: {
    id:     "store-2",
    name:   "Minimarket Flora",
    slug:   "minimarket-flora",
    logo:   "/flora.png",
    zone:   "Yarinacocha",
    rating: 4.0,
  },
};

function makeReq(url: string): NextRequest {
  return new NextRequest(url);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/marketplace/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults para los mocks del batchProductEnrichment — arrays vacíos
    // dejan que los Map del handler no se rompan. Los tests que necesiten
    // valores específicos los sobrescriben individualmente.
    mockProductImageFindMany.mockResolvedValue([]);
    mockProductVariantGroupBy.mockResolvedValue([]);
    mockReviewGroupBy.mockResolvedValue([]);
    mockOrderItemGroupBy.mockResolvedValue([]);
  });

  // ── Caso feliz ───────────────────────────────────────────────────────────────

  it("retorna resultados cross-tienda con query válido (200)", async () => {
    mockStoreProductFindMany.mockResolvedValue([RESULT_ARROZ, RESULT_ARROZ_LARGO]);

    const res = await GET(makeReq("https://host/api/marketplace/search?q=arroz"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.query).toBe("arroz");
  });

  it("retorna lista vacía si no hay coincidencias (200)", async () => {
    mockStoreProductFindMany.mockResolvedValue([]);

    const res = await GET(makeReq("https://host/api/marketplace/search?q=xyznotexists"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  // ── Validación de query obligatorio ──────────────────────────────────────────

  it("retorna 400 si falta el parámetro q", async () => {
    const res = await GET(makeReq("https://host/api/marketplace/search"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.issues).toBeDefined();
  });

  it("retorna 400 si q está vacío (string de 0 chars)", async () => {
    const res = await GET(makeReq("https://host/api/marketplace/search?q="));
    expect(res.status).toBe(400);
  });

  it("retorna 400 si q supera 100 caracteres", async () => {
    const longQuery = "a".repeat(101);
    const res = await GET(makeReq(`https://host/api/marketplace/search?q=${longQuery}`));
    expect(res.status).toBe(400);
  });

  // ── Filtros adicionales ───────────────────────────────────────────────────────

  it("filtra por zone — pasa zone al where de store de Prisma", async () => {
    mockStoreProductFindMany.mockResolvedValue([RESULT_ARROZ]);

    await GET(makeReq("https://host/api/marketplace/search?q=arroz&zone=Centro"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    expect(callArgs.where.store).toMatchObject({ isPublished: true, zone: "Centro" });
  });

  it("filtra por category — pasa category al where de product de Prisma", async () => {
    mockStoreProductFindMany.mockResolvedValue([RESULT_ARROZ]);

    await GET(makeReq("https://host/api/marketplace/search?q=arroz&category=Abarrotes"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    expect(callArgs.where.product.category).toBe("Abarrotes");
  });

  it("SIEMPRE busca solo en productos activos (isActive:true)", async () => {
    mockStoreProductFindMany.mockResolvedValue([]);

    await GET(makeReq("https://host/api/marketplace/search?q=arroz"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    expect(callArgs.where.isActive).toBe(true);
  });

  it("SIEMPRE filtra tiendas publicadas (isPublished:true) en búsqueda cross-tienda", async () => {
    mockStoreProductFindMany.mockResolvedValue([]);

    await GET(makeReq("https://host/api/marketplace/search?q=aceite"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    expect(callArgs.where.store.isPublished).toBe(true);
  });

  // ── Estructura de la respuesta ────────────────────────────────────────────────

  it("cada resultado incluye precio, datos del producto y de la tienda", async () => {
    mockStoreProductFindMany.mockResolvedValue([RESULT_ARROZ]);

    const res = await GET(makeReq("https://host/api/marketplace/search?q=arroz"));
    const body = await res.json();
    const item = body.data[0];

    // El handler aplana la respuesta — campos directos en el objeto resultado
    expect(item).toHaveProperty("price");
    expect(item).toHaveProperty("productName");
    expect(item).toHaveProperty("category");
    // Tienda
    expect(item).toHaveProperty("storeName");
    expect(item).toHaveProperty("storeSlug");
    expect(item).toHaveProperty("storeZone");
  });

  it("resultados están ordenados por precio ascendente", async () => {
    mockStoreProductFindMany.mockResolvedValue([RESULT_ARROZ, RESULT_ARROZ_LARGO]);

    await GET(makeReq("https://host/api/marketplace/search?q=arroz"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    expect(callArgs.orderBy).toMatchObject({ retailPrice: "asc" });
  });

  // ── Error de BD ──────────────────────────────────────────────────────────────

  it("retorna 500 si Prisma lanza excepción", async () => {
    mockStoreProductFindMany.mockRejectedValue(new Error("DB timeout"));

    const res = await GET(makeReq("https://host/api/marketplace/search?q=arroz"));
    expect(res.status).toBe(500);
  });
});
