/**
 * Tests unitarios — /api/marketplace/stores/[slug]/products
 *
 * Cubre:
 *  - GET catálogo público de una tienda (200)
 *  - Filtro por category
 *  - Filtro por search
 *  - Filtros category + search combinados (caso de colisión de spread corregido)
 *  - Cursor pagination — nextCursor presente cuando hay más resultados
 *  - Cursor pagination — nextCursor null cuando no hay más
 *  - Tienda no publicada / no existente → 404
 *  - Parámetros inválidos → 400
 *  - Error de BD → 500
 *  - wholesalePrice NO se expone en la respuesta pública
 *  - getOrSet cacheado — Prisma se llama 1 sola vez ante dos requests idénticas
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

// ── Mock: cache — passthrough para que los tests no dependan de estado cacheado ─
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));

// ── Mock: prisma ───────────────────────────────────────────────────────────────
const { mockStoreFindUnique, mockStoreProductFindMany } = vi.hoisted(() => ({
  mockStoreFindUnique:      vi.fn(),
  mockStoreProductFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    store:        { findUnique: mockStoreFindUnique },
    storeProduct: { findMany: mockStoreProductFindMany },
  },
}));

import { GET } from "@/app/api/marketplace/stores/[slug]/products/route";
import { getOrSet } from "@/lib/cache";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const STORE = { id: "store-1", isPublished: true };

const SP_ARROZ = {
  id:          "sp-uuid-1",
  retailPrice: 3.5,
  minOrderQty: 1,
  product: { id: 1, name: "Arroz Extra", image: "/arroz.png", category: "Abarrotes", unit: "kg", stock: 20 },
};
const SP_ACEITE = {
  id:          "sp-uuid-2",
  retailPrice: 8.0,
  minOrderQty: 1,
  product: { id: 2, name: "Aceite Vegetal", image: "/aceite.png", category: "Abarrotes", unit: "L", stock: 10 },
};
const SP_GASEOSA = {
  id:          "sp-uuid-3",
  retailPrice: 2.5,
  minOrderQty: 6,
  product: { id: 3, name: "Gaseosa Cola", image: "/cola.png", category: "Bebidas", unit: "L", stock: 50 },
};

function makeReq(url: string): NextRequest {
  return new NextRequest(url);
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/marketplace/stores/[slug]/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreFindUnique.mockResolvedValue(STORE);
    mockStoreProductFindMany.mockResolvedValue([SP_ARROZ, SP_ACEITE]);
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
    mockStoreProductFindMany.mockResolvedValue([SP_ARROZ]);

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
    const spConWholesale = { ...SP_ARROZ, wholesalePrice: 3.0 };
    mockStoreProductFindMany.mockResolvedValue([spConWholesale]);

    const res  = await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));
    const body = await res.json();

    expect(body.data[0].wholesalePrice).toBeUndefined();
  });

  // ── Filtro por category ─────────────────────────────────────────────────────

  it("filtra por category — pasa solo category al Product filter", async () => {
    mockStoreProductFindMany.mockResolvedValue([SP_ARROZ]);

    await GET(makeReq("https://host/?category=Abarrotes"), makeParams("bodega-san-martin"));

    const where = mockStoreProductFindMany.mock.calls[0][0].where;
    expect(where.product).toMatchObject({ category: "Abarrotes" });
    expect(where.product.name).toBeUndefined();
  });

  // ── Filtro por search ───────────────────────────────────────────────────────

  it("filtra por search — pasa name.contains al Product filter", async () => {
    mockStoreProductFindMany.mockResolvedValue([SP_ARROZ]);

    await GET(makeReq("https://host/?search=arroz"), makeParams("bodega-san-martin"));

    const where = mockStoreProductFindMany.mock.calls[0][0].where;
    expect(where.product.name).toMatchObject({ contains: "arroz", mode: "insensitive" });
    expect(where.product.category).toBeUndefined();
  });

  // ── Colisión de filtros (regresión) ─────────────────────────────────────────
  // Antes del fix, el segundo { Product: ... } silenciosamente sobreescribía al primero en Prisma.
  // Ahora se fusionan en un solo objeto Product con ambas claves.

  it("category + search combinados — ambas condiciones en el mismo objeto Product", async () => {
    mockStoreProductFindMany.mockResolvedValue([SP_ARROZ]);

    await GET(makeReq("https://host/?category=Abarrotes&search=arroz"), makeParams("bodega-san-martin"));

    const where = mockStoreProductFindMany.mock.calls[0][0].where;

    // Un solo product filter con AMBAS claves — no dos objetos separados
    expect(where.product).toMatchObject({
      category: "Abarrotes",
      name: { contains: "arroz", mode: "insensitive" },
    });
  });

  it("sin filtros — no hay clave product en el where", async () => {
    await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));

    const where = mockStoreProductFindMany.mock.calls[0][0].where;
    expect(where.product).toBeUndefined();
  });

  // ── Cursor pagination ───────────────────────────────────────────────────────

  it("nextCursor presente cuando hay más resultados (take+1 devuelve extra)", async () => {
    // limit=2 — devuelve 3 items (uno extra) → hasMore=true
    const three = [SP_ARROZ, SP_ACEITE, SP_GASEOSA];
    mockStoreProductFindMany.mockResolvedValue(three);

    const res  = await GET(makeReq("https://host/?limit=2"), makeParams("bodega-san-martin"));
    const body = await res.json();

    expect(body.data).toHaveLength(2);
    expect(body.nextCursor).toBe(SP_ACEITE.id); // último del slice
  });

  it("nextCursor es null cuando los resultados caben en el límite", async () => {
    mockStoreProductFindMany.mockResolvedValue([SP_ARROZ, SP_ACEITE]); // 2 items con limit=50

    const res  = await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));
    const body = await res.json();

    expect(body.nextCursor).toBeNull();
  });

  it("pasa cursor a Prisma como { cursor: { id }, skip: 1 }", async () => {
    mockStoreProductFindMany.mockResolvedValue([SP_ACEITE]);

    await GET(makeReq(`https://host/?cursor=${SP_ARROZ.id}`), makeParams("bodega-san-martin"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    expect(callArgs.cursor).toEqual({ id: SP_ARROZ.id });
    expect(callArgs.skip).toBe(1);
  });

  it("sin cursor — no pasa cursor ni skip a Prisma", async () => {
    mockStoreProductFindMany.mockResolvedValue([SP_ARROZ]);

    await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    expect(callArgs.cursor).toBeUndefined();
    expect(callArgs.skip).toBeUndefined();
  });

  // ── Ordenamiento ────────────────────────────────────────────────────────────

  it("sort=price_desc — pasa retailPrice:desc con id:asc como tiebreaker", async () => {
    mockStoreProductFindMany.mockResolvedValue([SP_ACEITE, SP_ARROZ]);

    await GET(makeReq("https://host/?sort=price_desc"), makeParams("bodega-san-martin"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual([{ retailPrice: "desc" }, { id: "asc" }]);
  });

  it("sort por defecto (price_asc)", async () => {
    await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));

    const callArgs = mockStoreProductFindMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual([{ retailPrice: "asc" }, { id: "asc" }]);
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
    mockStoreFindUnique.mockResolvedValue(null);

    const res = await GET(makeReq("https://host/"), makeParams("no-existe"));
    expect(res.status).toBe(404);
  });

  it("retorna 404 si la tienda no está publicada", async () => {
    mockStoreFindUnique.mockResolvedValue({ id: "store-1", isPublished: false });

    const res = await GET(makeReq("https://host/"), makeParams("tienda-draft"));
    expect(res.status).toBe(404);
  });

  // ── Validación de parámetros ────────────────────────────────────────────────

  it("retorna 400 si limit excede 100", async () => {
    const res = await GET(makeReq("https://host/?limit=9999"), makeParams("bodega-san-martin"));
    expect(res.status).toBe(400);
  });

  it("retorna 400 si sort tiene valor no permitido", async () => {
    const res = await GET(makeReq("https://host/?sort=invalid"), makeParams("bodega-san-martin"));
    expect(res.status).toBe(400);
  });

  // ── Error de BD ─────────────────────────────────────────────────────────────

  it("retorna 500 si Prisma lanza excepción inesperada", async () => {
    mockStoreProductFindMany.mockRejectedValue(new Error("connection timeout"));

    const res = await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));
    expect(res.status).toBe(500);
  });

  // ── SIEMPRE solo productos activos ──────────────────────────────────────────

  it("SIEMPRE filtra isActive:true", async () => {
    await GET(makeReq("https://host/"), makeParams("bodega-san-martin"));

    const where = mockStoreProductFindMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
  });
});
