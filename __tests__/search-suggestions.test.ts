/**
 * Tests: SearchSuggestionsDB (C4)
 * Cubre: record upsert, getTopSuggestions, getDidYouMean, getProductFuzzyMatches.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { mockUpsert, mockFindMany, mockQueryRaw } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockFindMany: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    searchSuggestion: {
      upsert: mockUpsert,
      findMany: mockFindMany,
    },
    $queryRaw: mockQueryRaw,
  },
}));

import {
  SearchSuggestionsDB,
  normalizeQuery,
} from "@/lib/db/search-suggestions.db";

const TENANT = "main";

describe("normalizeQuery", () => {
  it("convierte a lowercase y elimina tildes", () => {
    expect(normalizeQuery("Aceité")).toBe("aceite");
    expect(normalizeQuery("  CAFÉ  ")).toBe("cafe");
    expect(normalizeQuery("Ñoño")).toBe("nono");
  });

  it("devuelve string vacío para query vacía o de solo espacios", () => {
    expect(normalizeQuery("")).toBe("");
    expect(normalizeQuery("   ")).toBe("");
  });
});

describe("SearchSuggestionsDB.record", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({});
  });

  it("normaliza la query antes de hacer upsert", async () => {
    await SearchSuggestionsDB.record(TENANT, "Aceité de Oliva", 5);

    expect(mockUpsert).toHaveBeenCalledOnce();
    const call = mockUpsert.mock.calls[0][0];
    expect(call.where.tenantId_normalizedQuery.normalizedQuery).toBe("aceite de oliva");
    expect(call.create.query).toBe("Aceité de Oliva");
    expect(call.create.searchCount).toBe(1);
  });

  it("no llama upsert si la query normalizada está vacía", async () => {
    await SearchSuggestionsDB.record(TENANT, "   ", 0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("incluye clickedProductId cuando se proporciona", async () => {
    await SearchSuggestionsDB.record(TENANT, "arroz", 10, 42);

    const call = mockUpsert.mock.calls[0][0];
    expect(call.create.clickedProductId).toBe(42);
    expect(call.update.clickedProductId).toBe(42);
  });

  it("incrementa searchCount en update", async () => {
    await SearchSuggestionsDB.record(TENANT, "leche", 3);

    const call = mockUpsert.mock.calls[0][0];
    expect(call.update.searchCount).toEqual({ increment: 1 });
  });
});

describe("SearchSuggestionsDB.getTopSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve array vacío para prefix vacío", async () => {
    const result = await SearchSuggestionsDB.getTopSuggestions(TENANT, "");
    expect(result).toEqual([]);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("ordena por searchCount desc y mapea correctamente", async () => {
    const now = new Date();
    mockFindMany.mockResolvedValueOnce([
      { query: "arroz", normalizedQuery: "arroz", searchCount: 50, lastSearchedAt: now },
      { query: "azúcar", normalizedQuery: "azucar", searchCount: 20, lastSearchedAt: now },
    ]);

    const result = await SearchSuggestionsDB.getTopSuggestions(TENANT, "ar", 8);

    expect(result).toHaveLength(2);
    expect(result[0].query).toBe("arroz");
    expect(result[0].searchCount).toBe(50);
    expect(typeof result[0].lastSearchedAt).toBe("string");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, normalizedQuery: { startsWith: "ar" } },
        take: 8,
      }),
    );
  });
});

describe("SearchSuggestionsDB.getDidYouMean", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve array vacío para query vacía", async () => {
    const result = await SearchSuggestionsDB.getDidYouMean(TENANT, "");
    expect(result).toEqual([]);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("mapea resultados de pg_trgm a DbDidYouMean", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { normalized_query: "arroz", sim: 0.65 },
      { normalized_query: "aros", sim: 0.42 },
    ]);

    const result = await SearchSuggestionsDB.getDidYouMean(TENANT, "arros");

    expect(result).toHaveLength(2);
    expect(result[0].suggestion).toBe("arroz");
    expect(result[0].similarity).toBeCloseTo(0.65);
    expect(result[1].similarity).toBeCloseTo(0.42);
  });
});

describe("SearchSuggestionsDB.getProductFuzzyMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve array vacío para query vacía", async () => {
    const result = await SearchSuggestionsDB.getProductFuzzyMatches(TENANT, "");
    expect(result).toEqual([]);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("mapea resultados de similaridad a DbFuzzyProduct", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: 1, name: "Arroz Integral", category: "Granos", image: null, sim: 0.55 },
      { id: 2, name: "Arroz Blanco", category: "Granos", image: "/img.jpg", sim: 0.45 },
    ]);

    const result = await SearchSuggestionsDB.getProductFuzzyMatches(TENANT, "arros");

    expect(result).toHaveLength(2);
    expect(result[0].productId).toBe(1);
    expect(result[0].productName).toBe("Arroz Integral");
    expect(result[0].similarity).toBeCloseTo(0.55);
    expect(result[1].image).toBe("/img.jpg");
  });
});
