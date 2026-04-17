/**
 * Unit tests for lib/recommender/hybrid.ts.
 *
 * Cubre las 4 ramas de degradación documentadas en ADR-042:
 *
 *  | Estado del tenant             | Fuente esperada |
 *  |-------------------------------|------------------|
 *  | pgvector OK + copurchase OK   | "hybrid"         |
 *  | pgvector fail, copurchase OK  | "copurchase"     |
 *  | pgvector OK, copurchase vacío | "hybrid"         |
 *  | Ambos vacíos + producto no existe | "empty"      |
 *
 * Además verifica la ecuación de blend (70/30) y que la lista final
 * ordene descendente por `score`.
 *
 * Mocks:
 *  - @/lib/prisma → $queryRawUnsafe controlable por test
 *  - @/lib/db/products.db → ProductsDB.getById + getAll
 *  - @/lib/recommender/embeddings → generateEmbedding mockeable
 *  - @/lib/logger → silent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks antes de importar el módulo bajo prueba ───────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock("@/lib/db/products.db", () => ({
  ProductsDB: {
    getById: vi.fn(),
    getAll: vi.fn(),
  },
}));

vi.mock("@/lib/recommender/embeddings", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/recommender/embeddings")
  >("@/lib/recommender/embeddings");
  return {
    ...actual,
    generateEmbedding: vi.fn(),
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Imports después de los mocks ────────────────────────────────────────────

import { getHybridRecommendations } from "@/lib/recommender/hybrid";
import { prisma } from "@/lib/prisma";
import { ProductsDB } from "@/lib/db/products.db";
import { generateEmbedding, EMBEDDING_DIM } from "@/lib/recommender/embeddings";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockQuery = prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>;
const mockGetById = ProductsDB.getById as ReturnType<typeof vi.fn>;
const mockGetAll = ProductsDB.getAll as ReturnType<typeof vi.fn>;
const mockEmbed = generateEmbedding as ReturnType<typeof vi.fn>;

function product(id: number, name: string, price = 10) {
  return {
    id,
    name,
    category: "cat",
    price,
    image: "",
    unit: "u",
    active: true,
    tenantId: "t1",
  };
}

const fakeEmbedding = () =>
  Array.from({ length: EMBEDDING_DIM }, () => 0.01);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("getHybridRecommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty when source product doesn't exist", async () => {
    mockGetById.mockResolvedValueOnce(null);

    const out = await getHybridRecommendations("t1", 999);

    expect(out).toEqual({ recommendations: [], source: "empty" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns empty when input validation fails", async () => {
    const out = await getHybridRecommendations("", 1);
    expect(out.recommendations).toHaveLength(0);
    expect(out.source).toBe("empty");
  });

  it("degrades to copurchase when embedding cannot be generated", async () => {
    mockGetById.mockResolvedValueOnce(product(1, "Leche"));
    mockEmbed.mockResolvedValueOnce(null); // no API key scenario
    // vectorSearch will NOT be called because we short-circuit on null embed.
    // Only copurchase is queried:
    mockQuery.mockResolvedValueOnce([
      { productId: 2, cnt: 10 },
      { productId: 3, cnt: 5 },
    ]);
    mockGetAll.mockResolvedValueOnce([
      product(2, "Pan"),
      product(3, "Queso"),
    ]);

    const out = await getHybridRecommendations("t1", 1, 5);

    expect(out.source).toBe("copurchase");
    expect(out.recommendations).toHaveLength(2);
    expect(out.recommendations[0].productId).toBe(2); // higher cnt first
    expect(out.recommendations[0].vectorScore).toBe(0);
    expect(out.recommendations[0].copurchaseScore).toBe(1); // 10/10
    expect(out.recommendations[0].score).toBeCloseTo(0.3, 5); // 0.3 * 1
  });

  it("returns hybrid source when pgvector returns rows", async () => {
    mockGetById.mockResolvedValueOnce(product(1, "Leche"));
    mockEmbed.mockResolvedValueOnce(fakeEmbedding());

    // Two parallel queries fire via Promise.all:
    //   vectorSearch → rows with distance
    //   copurchase   → rows with cnt
    mockQuery
      .mockResolvedValueOnce([
        { id: 2, distance: 0.2 },
        { id: 4, distance: 0.5 },
      ])
      .mockResolvedValueOnce([{ productId: 2, cnt: 7 }]);

    mockGetAll.mockResolvedValueOnce([
      product(2, "Pan"),
      product(4, "Arroz"),
    ]);

    const out = await getHybridRecommendations("t1", 1, 5);

    expect(out.source).toBe("hybrid");
    expect(out.recommendations).toHaveLength(2);

    const rec2 = out.recommendations.find((r) => r.productId === 2);
    expect(rec2).toBeDefined();
    // vector: 1 - 0.2 = 0.8; copurchase: 7/7 = 1 → 0.7*0.8 + 0.3*1 = 0.86
    expect(rec2?.score).toBeCloseTo(0.86, 5);

    const rec4 = out.recommendations.find((r) => r.productId === 4);
    // vector: 1 - 0.5 = 0.5; copurchase: 0 → 0.7*0.5 = 0.35
    expect(rec4?.score).toBeCloseTo(0.35, 5);

    // Ordered by score desc
    expect(out.recommendations[0].score).toBeGreaterThan(
      out.recommendations[1].score,
    );
  });

  it("returns empty when both sources produce zero candidates", async () => {
    mockGetById.mockResolvedValueOnce(product(1, "Leche"));
    mockEmbed.mockResolvedValueOnce(fakeEmbedding());

    mockQuery
      .mockResolvedValueOnce([]) // vector empty
      .mockResolvedValueOnce([]); // copurchase empty

    const out = await getHybridRecommendations("t1", 1, 5);

    expect(out.source).toBe("empty");
    expect(out.recommendations).toHaveLength(0);
  });

  it("filters out inactive products from the final list", async () => {
    mockGetById.mockResolvedValueOnce(product(1, "Leche"));
    mockEmbed.mockResolvedValueOnce(fakeEmbedding());

    mockQuery
      .mockResolvedValueOnce([
        { id: 2, distance: 0.1 },
        { id: 3, distance: 0.2 },
      ])
      .mockResolvedValueOnce([]);

    const inactivePan = { ...product(2, "Pan"), active: false };
    mockGetAll.mockResolvedValueOnce([inactivePan, product(3, "Queso")]);

    const out = await getHybridRecommendations("t1", 1, 5);

    expect(out.recommendations.map((r) => r.productId)).toEqual([3]);
  });

  it("respects the limit parameter", async () => {
    mockGetById.mockResolvedValueOnce(product(1, "Leche"));
    mockEmbed.mockResolvedValueOnce(fakeEmbedding());

    const vectorRows = Array.from({ length: 10 }, (_, i) => ({
      id: i + 2,
      distance: i * 0.05,
    }));
    mockQuery
      .mockResolvedValueOnce(vectorRows)
      .mockResolvedValueOnce([]);

    mockGetAll.mockResolvedValueOnce(
      vectorRows.map((r) => product(r.id, `P${r.id}`)),
    );

    const out = await getHybridRecommendations("t1", 1, 3);

    expect(out.recommendations).toHaveLength(3);
  });

  it("gracefully handles pgvector not installed (generic DB error)", async () => {
    mockGetById.mockResolvedValueOnce(product(1, "Leche"));
    mockEmbed.mockResolvedValueOnce(fakeEmbedding());

    mockQuery
      .mockRejectedValueOnce(new Error("type \"vector\" does not exist"))
      .mockResolvedValueOnce([{ productId: 5, cnt: 3 }]);

    mockGetAll.mockResolvedValueOnce([product(5, "Aceite")]);

    const out = await getHybridRecommendations("t1", 1, 5);

    expect(out.source).toBe("copurchase");
    expect(out.recommendations.map((r) => r.productId)).toEqual([5]);
  });
});
