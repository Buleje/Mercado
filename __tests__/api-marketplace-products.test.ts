/**
 * Tests unitarios — /api/marketplace/stores/[slug]/products
 *
 * Audit 2026-05-19: el endpoint se migró a MarketplaceStoreProductsDB.listForStorefront.
 * Los tests ya no asertan sobre llamadas internas a Prisma — asertan sobre:
 *  1) las opciones pasadas a la DB class (category, search, sort, limit, cursor)
 *  2) la respuesta HTTP (data shape, nextCursor, total, status codes)
 *  3) wholesalePrice nunca expuesto (responsabilidad de la DB class, contrato)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// ── Mock: logger ──────────────────────────────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock: api-error ───────────────────────────────────────────────────────────
vi.mock("@/lib/api-error", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-error")>();
  return {
    ...actual,
    newTraceId: vi.fn(() => "trace-prod-test"),
  };
});

// ── Mock: cache — passthrough ─────────────────────────────────────────────────
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));

// ── Mock: lib/db/marketplace ──────────────────────────────────────────────────
const { mockGetBySlug, mockListForStorefront } = vi.hoisted(() => ({
  mockGetBySlug:         vi.fn(),
  mockListForStorefront: vi.fn(),
}));

vi.mock("@/lib/db/marketplace.db", () => ({
  MarketplaceStoresDB:        { getBySlug: mockGetBySlug },
  MarketplaceStoreProductsDB: { listForStorefront: mockListForStorefront },
}));

import { GET } from "@/app/api/marketplace/stores/[slug]/products/route";
import { getOrSet } from "@/lib/cache";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STORE = { id: "store-1", isPublished: true };

// Shape devuelto por listForStorefront (sin wholesalePrice — DB class lo strippa)
const PROD_ARROZ = {
  id:             1,
  storeProductId: "sp-uuid-1",
  name:           "Arroz Extra",
  price:          3.5,
  minOrderQty:    1,
  image:          "/arroz.png",
  category:       "Abarrotes",
  unit:           "kg",
  stock:          20,
};
const PROD_ACEITE = {
  id:             2,
  storeProductId: "sp-uuid-2",
  name:           "Aceite Vegetal",
  price:          8.0,
  minOrderQty:    1,
  image:          "/aceite.png",
  category:       "Abarrotes",
  unit:           "L",
  stock:          10,
};

function makeReq(url: string): NextRequest {
  return new NextRequest(url);
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

// Helper: setear retorno default de listForStorefront con products + cursor null
function setProducts(products: unknown[], nextCursor: string | null = null) {
  mockListForStorefront.mockResolvedValue({ products, nextCursor });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/marketplace/stores/[slug]/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBySlug.mockResolvedValue(STORE);
    setProducts([PROD_ARROZ, PROD_ACEITE]);
  });

  // ── Caso feliz ──────────────────────────────────────────────────────────────

  it("retorna catálogo de la tienda (200)", async () => {
    const res  = await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("cada producto tiene los campos requeridos por el frontend", async () => {
    setProducts([PROD_ARROZ]);

    const res  = await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));
    const body = await res.json();
    const item = body.data[0];

    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("storeProductId");
    expect(item).toHaveProperty("name");
    expect(item).toHaveProperty("price");
    expect(item).toHaveProperty("minOrderQty");
    expect(item).toHaveProperty("image");
    expect(item).toHaveProperty("category");
    expect(item).toHaveProperty("unit");
    expect(item).toHaveProperty("stock");
  });

  it("NO expone wholesalePrice en la respuesta pública", async () => {
    // El DB class strippa wholesalePrice del select. Si el fixture no lo incluye,
    // confirmamos el contrato a nivel de respuesta del endpoint.
    setProducts([PROD_ARROZ]);

    const res  = await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));
    const body = await res.json();

    expect(body.data[0].wholesalePrice).toBeUndefined();
  });

  // ── Filtros — verificación del contrato con la DB class ─────────────────────

  it("filtra por category — pasa category a listForStorefront", async () => {
    await GET(makeReq("https://host/?category=Abarrotes"), makeParams("bodega-san-martin"));

    expect(mockListForStorefront).toHaveBeenCalledWith(
      STORE.id,
      expect.objectContaining({ category: "Abarrotes" }),
    );
  });

  it("filtra por search — pasa search a listForStorefront", async () => {
    await GET(makeReq("https://host/?search=arroz"), makeParams("bodega-san-martin"));

    expect(mockListForStorefront).toHaveBeenCalledWith(
      STORE.id,
      expect.objectContaining({ search: "arroz" }),
    );
  });

  it("category + search combinados — ambos pasan a listForStorefront", async () => {
    await GET(makeReq("https://host/?category=Abarrotes&search=arroz"), makeParams("bodega-san-martin"));

    expect(mockListForStorefront).toHaveBeenCalledWith(
      STORE.id,
      expect.objectContaining({ category: "Abarrotes", search: "arroz" }),
    );
  });

  it("sin filtros — opts no incluye category/search", async () => {
    await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));

    const opts = mockListForStorefront.mock.calls[0][1];
    expect(opts.category).toBeUndefined();
    expect(opts.search).toBeUndefined();
  });

  // ── Cursor pagination ───────────────────────────────────────────────────────

  it("nextCursor presente cuando la DB class lo retorna", async () => {
    setProducts([PROD_ARROZ, PROD_ACEITE], PROD_ACEITE.storeProductId);

    const res  = await GET(makeReq("https://host/?limit=2"), makeParams("bodega-san-martin"));
    const body = await res.json();

    expect(body.data).toHaveLength(2);
    expect(body.nextCursor).toBe(PROD_ACEITE.storeProductId);
  });

  it("nextCursor es null cuando la DB class no lo retorna", async () => {
    setProducts([PROD_ARROZ, PROD_ACEITE], null);

    const res  = await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));
    const body = await res.json();

    expect(body.nextCursor).toBeNull();
  });

  it("pasa cursor a listForStorefront cuando viene en query", async () => {
    await GET(makeReq(`https://host/?cursor=${PROD_ARROZ.storeProductId}`), makeParams("bodega-san-martin"));

    expect(mockListForStorefront).toHaveBeenCalledWith(
      STORE.id,
      expect.objectContaining({ cursor: PROD_ARROZ.storeProductId }),
    );
  });

  it("sin cursor — opts no incluye cursor", async () => {
    await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));

    const opts = mockListForStorefront.mock.calls[0][1];
    expect(opts.cursor).toBeUndefined();
  });

  // ── Ordenamiento ────────────────────────────────────────────────────────────

  it("sort=price_desc — pasa sort a listForStorefront", async () => {
    await GET(makeReq("https://host/?sort=price_desc"), makeParams("bodega-san-martin"));

    expect(mockListForStorefront).toHaveBeenCalledWith(
      STORE.id,
      expect.objectContaining({ sort: "price_desc" }),
    );
  });

  it("sort por defecto — opts.sort undefined (DB class aplica price_asc)", async () => {
    await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));

    const opts = mockListForStorefront.mock.calls[0][1];
    expect(opts.sort).toBeUndefined();
  });

  // ── Cache ───────────────────────────────────────────────────────────────────

  it("usa getOrSet para cachear — la clave incluye slug y filtros", async () => {
    await GET(makeReq("https://host/?category=Abarrotes"), makeParams("mi-tienda"));

    expect(getOrSet).toHaveBeenCalledWith(
      expect.stringContaining("mi-tienda"),
      60,
      expect.any(Function),
    );
  });

  // ── Tienda no encontrada / no publicada ─────────────────────────────────────

  it("retorna 404 si la tienda no existe", async () => {
    mockGetBySlug.mockResolvedValue(null);

    const res = await GET(makeReq("https://host/"), makeParams("no-existe"));
    expect(res.status).toBe(404);
  });

  it("retorna 404 si la tienda no está publicada (getBySlug devuelve null)", async () => {
    mockGetBySlug.mockResolvedValue(null);

    const res = await GET(makeReq("https://host/"), makeParams("tienda-draft"));
    expect(res.status).toBe(404);
  });

  // ── Validación de parámetros ────────────────────────────────────────────────

  it("retorna 400 si limit excede el máximo", async () => {
    const res = await GET(makeReq("https://host/?limit=9999"), makeParams("bodega-san-martin"));
    expect(res.status).toBe(400);
  });

  it("retorna 400 si sort tiene valor no permitido", async () => {
    const res = await GET(makeReq("https://host/?sort=invalid"), makeParams("bodega-san-martin"));
    expect(res.status).toBe(400);
  });

  // ── Error de BD ─────────────────────────────────────────────────────────────

  it("retorna 500 si la DB class lanza excepción inesperada", async () => {
    mockListForStorefront.mockRejectedValue(new Error("connection timeout"));

    const res = await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));
    expect(res.status).toBe(500);
  });
});
