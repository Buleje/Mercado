/**
 * Tests: applyBoostsToProducts (C5 — sponsored-ranker)
 * Cubre: aplica boosts al top, respeta máx 3 sponsored por página.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { mockGetActiveBoosts, mockRecordImpression } = vi.hoisted(() => ({
  mockGetActiveBoosts: vi.fn(),
  mockRecordImpression: vi.fn(),
}));

vi.mock("@/lib/db/sponsored-boosts.db", () => ({
  SponsoredBoostsDB: {
    getActiveBoostsForRanking: mockGetActiveBoosts,
    recordImpression: mockRecordImpression,
  },
}));

import { applyBoostsToProducts } from "@/lib/marketplace/sponsored-ranker";

const TENANT = "main";

function makeProduct(productId: number, extra?: Record<string, unknown>) {
  return {
    productId,
    productName: `Producto ${productId}`,
    price: 10,
    isSponsored: false as boolean | undefined,
    sponsoredBoostId: null as string | null | undefined,
    ...extra,
  };
}

function makeBoost(productId: number, bidAmount: number, boostId?: string) {
  return {
    id: boostId ?? `boost-${productId}`,
    storeId: "store-1",
    productId,
    bidAmount,
    status: "active",
  };
}

describe("applyBoostsToProducts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordImpression.mockResolvedValue(undefined);
  });

  it("devuelve productos con isSponsored=false si no hay boosts activos", async () => {
    mockGetActiveBoosts.mockResolvedValueOnce([]);

    const products = [makeProduct(1), makeProduct(2)];
    const result = await applyBoostsToProducts(TENANT, products);

    expect(result).toHaveLength(2);
    expect(result[0].isSponsored).toBe(false);
    expect(result[1].isSponsored).toBe(false);
  });

  it("devuelve array vacío si la lista de productos está vacía", async () => {
    const result = await applyBoostsToProducts(TENANT, []);
    expect(result).toEqual([]);
    expect(mockGetActiveBoosts).not.toHaveBeenCalled();
  });

  it("sube el producto boosted al inicio de la lista", async () => {
    mockGetActiveBoosts.mockResolvedValueOnce([makeBoost(3, 15)]);

    const products = [makeProduct(1), makeProduct(2), makeProduct(3)];
    const result = await applyBoostsToProducts(TENANT, products);

    expect(result[0].productId).toBe(3);
    expect(result[0].isSponsored).toBe(true);
    expect(result[0].sponsoredBoostId).toBe("boost-3");
    expect(result[1].isSponsored).toBe(false);
    expect(result[2].isSponsored).toBe(false);
  });

  it("respeta el máximo de 3 sponsored por página aunque haya más boosts", async () => {
    mockGetActiveBoosts.mockResolvedValueOnce([
      makeBoost(1, 20),
      makeBoost(2, 18),
      makeBoost(3, 15),
      makeBoost(4, 10),
      makeBoost(5, 8),
    ]);

    const products = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => makeProduct(id));
    const result = await applyBoostsToProducts(TENANT, products);

    const sponsored = result.filter((r) => r.isSponsored);
    const organic = result.filter((r) => !r.isSponsored);

    expect(sponsored.length).toBe(3); // máx 3
    expect(organic.length).toBe(5);
    expect(result).toHaveLength(8); // longitud total preservada
  });

  it("ordena los sponsored por bidAmount descendente", async () => {
    mockGetActiveBoosts.mockResolvedValueOnce([
      makeBoost(1, 5, "boost-low"),
      makeBoost(2, 20, "boost-high"),
      makeBoost(3, 12, "boost-mid"),
    ]);

    const products = [makeProduct(1), makeProduct(2), makeProduct(3), makeProduct(4)];
    const result = await applyBoostsToProducts(TENANT, products);

    const sponsored = result.filter((r) => r.isSponsored);
    expect(sponsored[0].productId).toBe(2); // bid 20 → primero
    expect(sponsored[1].productId).toBe(3); // bid 12 → segundo
    expect(sponsored[2].productId).toBe(1); // bid 5 → tercero
  });

  it("llama recordImpression fire-and-forget por cada producto sponsored", async () => {
    mockGetActiveBoosts.mockResolvedValueOnce([
      makeBoost(1, 10),
      makeBoost(2, 8),
    ]);

    const products = [makeProduct(1), makeProduct(2), makeProduct(3)];
    await applyBoostsToProducts(TENANT, products);

    // Espera el tick del fire-and-forget
    await new Promise((r) => setTimeout(r, 0));

    expect(mockRecordImpression).toHaveBeenCalledTimes(2);
    expect(mockRecordImpression).toHaveBeenCalledWith(TENANT, "boost-1");
    expect(mockRecordImpression).toHaveBeenCalledWith(TENANT, "boost-2");
  });
});
