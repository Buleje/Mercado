import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  CATEGORIAS,
  findCategorySlugByProductCategory,
} from "@/lib/constants/marketplace-categories";

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
  /** Para `type: "product"` — slug de la categoría del producto, para
   *  navegar a `/marketplace/categoria/{slug}?q={query}`. */
  categorySlug?: string;
  /** Para `type: "store"` — slug de la tienda. */
  storeSlug?: string;
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
    const perGroup = Math.ceil(limit / 4);
    // Cada fetcher se aísla — si uno falla, los otros siguen devolviendo
    // resultados. Preferimos un dropdown parcial sobre un 500 total.
    // Productos: combinamos basic (contains, funciona con 1ra letra) +
    // fuzzy (pg_trgm, mejor para typos largos). Dedup por productId.
    const [queries, basicProducts, fuzzyProducts, stores, categories] = await Promise.all([
      this.getTopSuggestions(tenantId, prefix, perGroup).catch(() => []),
      this.getProductBasicMatches(tenantId, prefix, perGroup).catch(() => []),
      this.getProductFuzzyMatches(tenantId, prefix, perGroup).catch(() => []),
      this.getStoreMatches(tenantId, prefix, perGroup).catch(() => []),
      Promise.resolve(this.getCategoryMatches(prefix, perGroup)).catch(() => []),
    ]);

    // Dedup productos: basic gana sobre fuzzy si el mismo productId aparece
    const seenIds = new Set<number>();
    const products: DbFuzzyProduct[] = [];
    for (const p of [...basicProducts, ...fuzzyProducts]) {
      if (seenIds.has(p.productId)) continue;
      seenIds.add(p.productId);
      products.push(p);
      if (products.length >= perGroup * 2) break;
    }

    const queryItems: MarketplaceAutocompleteItem[] = queries.map((q) => ({
      id: `q:${q.normalizedQuery}`,
      type: "query",
      label: q.query,
      href: `/marketplace/buscar?q=${encodeURIComponent(q.query)}`,
      searchCount: q.searchCount,
    }));

    const productItems: MarketplaceAutocompleteItem[] = products.map((p) => {
      const slug = findCategorySlugByProductCategory(p.category);
      return {
        id: `p:${p.productId}`,
        type: "product",
        label: p.productName,
        subtitle: p.category,
        // Producto → categoría filtrada por la query del usuario (ver cliente).
        href: slug
          ? `/marketplace/categoria/${slug}?q=${encodeURIComponent(p.productName)}`
          : `/marketplace/buscar?q=${encodeURIComponent(p.productName)}`,
        image: p.image,
        categorySlug: slug ?? undefined,
      };
    });

    const storeItems: MarketplaceAutocompleteItem[] = stores.map((s) => ({
      id: `s:${s.id}`,
      type: "store",
      label: s.name,
      subtitle: s.zone ?? undefined,
      href: `/marketplace/${s.slug}`,
      image: s.logo ?? null,
      storeSlug: s.slug,
    }));

    const categoryItems: MarketplaceAutocompleteItem[] = categories.map((c) => ({
      id: `c:${c.slug}`,
      type: "category",
      label: c.label,
      href: `/marketplace/categoria/${c.slug}`,
    }));

    return [
      ...queryItems,
      ...productItems,
      ...storeItems,
      ...categoryItems,
    ].slice(0, limit);
  },

  /**
   * Match básico por `contains` (no pg_trgm) — funciona desde la primera
   * letra. Devuelve productos activos cuyo nombre/desc/categoria contiene
   * el prefix (case-insensitive).
   *
   * IMPORTANT: cross-tenant — el marketplace agrega productos de TODAS las
   * tiendas (no solo del tenant actual). Por eso NO filtramos por tenantId
   * aquí. Para autocomplete tenant-scoped usar `getProductFuzzyMatches`.
   */
  async getProductBasicMatches(
    _tenantId: string,
    prefix: string,
    limit: number,
  ): Promise<DbFuzzyProduct[]> {
    const needle = prefix.trim();
    if (!needle) return [];
    try {
      const rows = await prisma.product.findMany({
        where: {
          active: true,
          OR: [
            { name: { contains: needle, mode: "insensitive" } },
            { description: { contains: needle, mode: "insensitive" } },
            { category: { contains: needle, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, category: true, image: true },
        take: limit,
      });
      return rows.map((r) => ({
        productId: r.id,
        productName: r.name,
        category: r.category,
        image: r.image,
        similarity: 1, // exact substring match
      }));
    } catch (e) {
      logger.error("getProductMatches failed", { err: e instanceof Error ? e.message : String(e), op: "SearchSuggestionsDB.getProductMatches" });
      return [];
    }
  },

  /**
   * Tiendas cross-tenant — sin filtro por tenant para que el marketplace
   * encuentre stores publicadas en cualquier tenant.
   */
  async getStoreMatches(
    _tenantId: string,
    prefix: string,
    limit: number,
  ): Promise<Array<{ id: string; slug: string; name: string; zone: string | null; logo: string | null }>> {
    const needle = prefix.trim().toLowerCase();
    if (!needle) return [];
    try {
      const rows = await prisma.store.findMany({
        where: {
          isPublished: true,
          OR: [
            { name: { contains: needle, mode: "insensitive" } },
            { slug: { contains: needle, mode: "insensitive" } },
          ],
        },
        select: { id: true, slug: true, name: true, zone: true, logo: true },
        take: limit,
        orderBy: { reviewCount: "desc" },
      });
      return rows;
    } catch (e) {
      logger.error("getStoreMatches failed", { err: e instanceof Error ? e.message : String(e), op: "SearchSuggestionsDB.getStoreMatches" });
      return [];
    }
  },

  async getCategoryMatches(
    prefix: string,
    limit: number,
  ): Promise<Array<{ slug: string; label: string }>> {
    const needle = prefix.trim().toLowerCase();
    if (!needle) return [];
    const matches: Array<{ slug: string; label: string }> = [];
    for (const def of Object.values(CATEGORIAS)) {
      const hay =
        def.label.toLowerCase().includes(needle) ||
        def.subtitle.toLowerCase().includes(needle) ||
        def.keywords.some((k) => k.includes(needle)) ||
        def.subCategorias.some((sc) => sc.toLowerCase().includes(needle));
      if (hay) matches.push({ slug: def.slug, label: def.label });
      if (matches.length >= limit) break;
    }
    return matches;
  },
};
