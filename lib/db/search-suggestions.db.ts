import "server-only";
import { prisma } from "@/lib/prisma";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type DbSearchSuggestion = {
  query: string;
  normalizedQuery: string;
  searchCount: number;
  lastSearchedAt: string;
};

export type DbDidYouMean = {
  suggestion: string;
  similarity: number;
};

export type DbFuzzyProduct = {
  productId: number;
  productName: string;
  category: string;
  image: string | null;
  similarity: number;
};

/** Shape consumed by marketplace SearchAutocomplete component. */
export type MarketplaceAutocompleteItem = {
  id: string;
  type: "query" | "store" | "product" | "category";
  label: string;
  subtitle?: string;
  href: string;
  image?: string | null;
  searchCount?: number;
};

// ─── Normalización ────────────────────────────────────────────────────────────

/** Lowercase + sin tildes + trim. */
export function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// ─── SearchSuggestionsDB ──────────────────────────────────────────────────────

export const SearchSuggestionsDB = {
  /**
   * Registra una búsqueda. Hace upsert por [tenantId, normalizedQuery].
   * Incrementa searchCount y actualiza lastSearchedAt.
   */
  async record(
    tenantId: string,
    query: string,
    resultCount: number,
    clickedProductId?: number,
  ): Promise<void> {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) return;

    const now = new Date();

    await prisma.searchSuggestion.upsert({
      where: {
        tenantId_normalizedQuery: { tenantId, normalizedQuery },
      },
      create: {
        tenantId,
        query,
        normalizedQuery,
        resultCount,
        clickedProductId: clickedProductId ?? null,
        lastSearchedAt: now,
        searchCount: 1,
      },
      update: {
        lastSearchedAt: now,
        resultCount,
        ...(clickedProductId !== undefined && { clickedProductId }),
        searchCount: { increment: 1 },
      },
    });
  },

  /**
   * Devuelve sugerencias de autocompletado por prefijo.
   * Ordena por searchCount desc + lastSearchedAt desc.
   */
  async getTopSuggestions(
    tenantId: string,
    prefix: string,
    limit = 8,
  ): Promise<DbSearchSuggestion[]> {
    const normalizedPrefix = normalizeQuery(prefix);
    if (!normalizedPrefix) return [];

    const rows = await prisma.searchSuggestion.findMany({
      where: {
        tenantId,
        normalizedQuery: { startsWith: normalizedPrefix },
      },
      orderBy: [
        { searchCount: "desc" },
        { lastSearchedAt: "desc" },
      ],
      take: limit,
      select: {
        query: true,
        normalizedQuery: true,
        searchCount: true,
        lastSearchedAt: true,
      },
    });

    return rows.map((r) => ({
      query: r.query,
      normalizedQuery: r.normalizedQuery,
      searchCount: r.searchCount,
      lastSearchedAt: r.lastSearchedAt.toISOString(),
    }));
  },

  /**
   * "¿Quisiste decir...?" — trigram similarity contra queries registradas.
   * Devuelve las 3 queries más parecidas con similarity > 0.3.
   */
  async getDidYouMean(
    tenantId: string,
    query: string,
    limit = 3,
  ): Promise<DbDidYouMean[]> {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) return [];

    type Row = { normalized_query: string; sim: number };

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT
        "normalizedQuery" AS normalized_query,
        similarity("normalizedQuery", ${normalizedQuery}) AS sim
      FROM "SearchSuggestion"
      WHERE
        "tenantId" = ${tenantId}
        AND similarity("normalizedQuery", ${normalizedQuery}) > 0.3
        AND "normalizedQuery" <> ${normalizedQuery}
      ORDER BY sim DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      suggestion: r.normalized_query,
      similarity: typeof r.sim === "number" ? r.sim : Number(r.sim),
    }));
  },

  /**
   * Búsqueda fuzzy contra Product.name usando pg_trgm similarity.
   * Usado cuando la búsqueda exacta devuelve 0 resultados.
   */
  async getProductFuzzyMatches(
    tenantId: string,
    query: string,
    limit = 20,
  ): Promise<DbFuzzyProduct[]> {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) return [];

    type Row = {
      id: number;
      name: string;
      category: string;
      image: string | null;
      sim: number;
    };

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT
        p.id,
        p.name,
        p.category,
        p.image,
        GREATEST(
          similarity(lower(p.name), ${normalizedQuery}),
          similarity(lower(p.description), ${normalizedQuery})
        ) AS sim
      FROM "Product" p
      WHERE
        p."tenantId" = ${tenantId}
        AND p.active = true
        AND GREATEST(
          similarity(lower(p.name), ${normalizedQuery}),
          similarity(lower(p.description), ${normalizedQuery})
        ) > 0.2
      ORDER BY sim DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      productId: r.id,
      productName: r.name,
      category: r.category,
      image: r.image,
      similarity: typeof r.sim === "number" ? r.sim : Number(r.sim),
    }));
  },

  /**
   * Marketplace autocomplete: returns items grouped by type (query/store/product/category).
   *
   * Minimal implementation using existing suggestions + fuzzy product matches.
   * Stores and categories are not yet included — planned for a follow-up.
   */
  async getMarketplaceAutocomplete(
    tenantId: string,
    prefix: string,
    limit = 12,
  ): Promise<MarketplaceAutocompleteItem[]> {
    const [queries, products] = await Promise.all([
      this.getTopSuggestions(tenantId, prefix, Math.ceil(limit / 2)),
      this.getProductFuzzyMatches(tenantId, prefix, Math.ceil(limit / 2)),
    ]);

    const queryItems: MarketplaceAutocompleteItem[] = queries.map((q) => ({
      id: `q:${q.normalizedQuery}`,
      type: "query",
      label: q.query,
      href: `/marketplace?q=${encodeURIComponent(q.query)}`,
      searchCount: q.searchCount,
    }));

    const productItems: MarketplaceAutocompleteItem[] = products.map((p) => ({
      id: `p:${p.productId}`,
      type: "product",
      label: p.productName,
      subtitle: p.category,
      href: `/marketplace/p/${p.productId}`,
      image: p.image,
    }));

    return [...queryItems, ...productItems].slice(0, limit);
  },
};
