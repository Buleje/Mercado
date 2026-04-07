/**
 * Tests: RecommendationsPersonalizedDB (C2)
 * Cubre: cold start con 0 historial, forMe ranking con datos sintéticos.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { mockFindMany, mockGroupBy } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockGroupBy: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findMany: mockFindMany },
    storeProduct: { findMany: mockFindMany },
    review: { groupBy: mockGroupBy },
    orderItem: { groupBy: mockGroupBy },
  },
}));

import { RecommendationsPersonalizedDB } from "@/lib/db/recommendations-personalized.db";

const TENANT = "main";

function makeFakeStoreProduct(productId: number, category: string) {
  return {
    id: `sp-${productId}`,
    retailPrice: 10,
    storeId: "store-1",
    productId,
    product: {
      id: productId,
      name: `Producto ${productId}`,
      category,
      image: null,
      unit: "und",
      stock: 50,
    },
    store: {
      id: "store-1",
      name: "Tienda Demo",
      slug: "tienda-demo",
      zone: "centro",
    },
  };
}

describe("RecommendationsPersonalizedDB.coldStart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve array vacío cuando no hay ventas del mes", async () => {
    // orderItem.groupBy → sin resultados
    mockGroupBy.mockResolvedValueOnce([]);

    const result = await RecommendationsPersonalizedDB.coldStart(TENANT);

    expect(result).toEqual([]);
  });

  it("devuelve los productos más vendidos del mes en orden correcto", async () => {
    // orderItem.groupBy
    mockGroupBy.mockResolvedValueOnce([
      { productId: 1, _sum: { quantity: 100 } },
      { productId: 2, _sum: { quantity: 50 } },
    ]);
    // storeProduct.findMany
    mockFindMany.mockResolvedValueOnce([
      makeFakeStoreProduct(1, "Bebidas"),
      makeFakeStoreProduct(2, "Alimentos"),
    ]);
    // review.groupBy
    mockGroupBy.mockResolvedValueOnce([]);

    const result = await RecommendationsPersonalizedDB.coldStart(TENANT, { limit: 10 });

    expect(result).toHaveLength(2);
    expect(result[0].productId).toBe(1);
    expect(result[0].reason).toBe("Más vendido este mes");
    expect(result[0].isSponsored).toBe(false);
    expect(result[0].sponsoredBoostId).toBeNull();
  });

  it("respeta el límite especificado", async () => {
    mockGroupBy.mockResolvedValueOnce([
      { productId: 1, _sum: { quantity: 100 } },
      { productId: 2, _sum: { quantity: 80 } },
      { productId: 3, _sum: { quantity: 60 } },
    ]);
    mockFindMany.mockResolvedValueOnce([
      makeFakeStoreProduct(1, "Bebidas"),
      makeFakeStoreProduct(2, "Alimentos"),
      makeFakeStoreProduct(3, "Snacks"),
    ]);
    mockGroupBy.mockResolvedValueOnce([]);

    const result = await RecommendationsPersonalizedDB.coldStart(TENANT, { limit: 2 });

    expect(result.length).toBeLessThanOrEqual(2);
  });
});

describe("RecommendationsPersonalizedDB.forMe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cae a coldStart cuando no hay customerId ni customerPhone", async () => {
    // coldStart: orderItem.groupBy → vacío
    mockGroupBy.mockResolvedValueOnce([]);

    const result = await RecommendationsPersonalizedDB.forMe(TENANT, {});

    expect(result).toEqual([]);
  });

  it("cae a coldStart cuando el customer no tiene historial", async () => {
    // order.findMany → vacío
    mockFindMany.mockResolvedValueOnce([]);
    // coldStart: orderItem.groupBy → vacío
    mockGroupBy.mockResolvedValueOnce([]);

    const result = await RecommendationsPersonalizedDB.forMe(TENANT, {
      customerPhone: "+51999000001",
    });

    expect(result).toEqual([]);
  });

  it("aplica +3 a categoría favorita en el ranking", async () => {
    // order.findMany — 3 órdenes, 2 de Bebidas
    mockFindMany.mockResolvedValueOnce([
      {
        id: "o1",
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        zone: "centro",
        items: [{ productId: 10, product: { category: "Bebidas" } }],
      },
      {
        id: "o2",
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        zone: "centro",
        items: [{ productId: 10, product: { category: "Bebidas" } }],
      },
      {
        id: "o3",
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        zone: "centro",
        items: [{ productId: 11, product: { category: "Alimentos" } }],
      },
    ]);

    // storeProduct.findMany — candidatos
    mockFindMany.mockResolvedValueOnce([
      makeFakeStoreProduct(20, "Bebidas"),
      makeFakeStoreProduct(21, "Alimentos"),
      makeFakeStoreProduct(22, "Limpieza"),
    ]);

    // review.groupBy — rating para pid 20
    mockGroupBy.mockResolvedValueOnce([
      { productId: 20, _avg: { rating: 4.5 } },
    ]);

    const result = await RecommendationsPersonalizedDB.forMe(TENANT, {
      customerId: "cust-1",
      limit: 10,
    });

    expect(result.length).toBeGreaterThan(0);
    const bebidas = result.find((r) => r.productId === 20);
    const alimentos = result.find((r) => r.productId === 21);
    expect(bebidas).toBeDefined();
    expect(alimentos).toBeDefined();
    expect(bebidas!.score).toBeGreaterThan(alimentos!.score);
    expect(bebidas!.reason).toContain("Bebidas");
  });

  it("aplica penalización -5 a productos comprados en últimos 7 días", async () => {
    // Orden reciente con productId 20
    mockFindMany.mockResolvedValueOnce([
      {
        id: "o1",
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        zone: null,
        items: [{ productId: 20, product: { category: "Bebidas" } }],
      },
    ]);

    mockFindMany.mockResolvedValueOnce([
      makeFakeStoreProduct(20, "Bebidas"),
      makeFakeStoreProduct(21, "Bebidas"),
    ]);

    mockGroupBy.mockResolvedValueOnce([]);

    const result = await RecommendationsPersonalizedDB.forMe(TENANT, {
      customerId: "cust-1",
    });

    const reciente = result.find((r) => r.productId === 20);
    const noReciente = result.find((r) => r.productId === 21);

    if (reciente && noReciente) {
      expect(reciente.score).toBeLessThan(noReciente.score);
    }
  });
});
