import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { toNumOrZero } from "@/lib/decimal-utils";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type SearchProduct = {
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  unit: string;
  category: string;
  stock: number | null;
  storeId: string;
  storeSlug: string;
  storeName: string;
  storeZone: string | null;
  storeRating: number;
};

export type StoreFacet = {
  id: string;
  slug: string;
  name: string;
  count: number;
  zone: string | null;
};

export type CategoryFacet = {
  category: string;
  count: number;
};

export type SearchFilters = {
  q?: string;
  categories?: string[];
  stores?: string[];
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  minRating?: number;
  zone?: string | null;
  deliveryTime?: "any" | "express" | "sameDay";
  sort?: "relevance" | "price_asc" | "price_desc" | "rating" | "newest";
  limit?: number;
  offset?: number;
};

export type SearchResult = {
  products: SearchProduct[];
  total: number;
  storesFacet: StoreFacet[];
  categoriesFacet: CategoryFacet[];
};

// ─── MarketplaceSearchDB ──────────────────────────────────────────────────────

export const MarketplaceSearchDB = {
  /**
   * Búsqueda global de productos en el marketplace.
   *
   * Busca sobre Product.name, Product.category y Store.name (insensitive).
   * Solo tiendas publicadas + storeProducts activos.
   *
   * Cache: 60s para resultados — la búsqueda es dinámica, corto TTL.
   */
  async search(filters: SearchFilters): Promise<SearchResult> {
    const {
      q,
      categories,
      stores,
      priceMin,
      priceMax,
      inStock,
      minRating,
      zone,
      sort = "relevance",
      limit = 24,
      offset = 0,
    } = filters;

    const cacheKey = `marketplace:search:${JSON.stringify(filters)}`;

    return getOrSet(cacheKey, 60, async () => {
      // ── Construir where ────────────────────────────────────────────────────

      // Full-text match sobre nombre + category del producto (OR entre sí)
      const productNameWhere = q?.trim()
        ? {
            OR: [
              { name: { contains: q.trim(), mode: "insensitive" as const } },
              { category: { contains: q.trim(), mode: "insensitive" as const } },
            ],
          }
        : {};

      const productWhere = {
        active: true,
        deletedAt: null,
        ...productNameWhere,
        ...(categories?.length && {
          OR: categories.map((c) => ({
            category: { contains: c, mode: "insensitive" as const },
          })),
        }),
      };

      const orderBy =
        sort === "price_asc"
          ? { retailPrice: "asc" as const }
          : sort === "price_desc"
            ? { retailPrice: "desc" as const }
            : sort === "newest"
              ? { id: "desc" as const }
              : sort === "rating"
                ? { store: { rating: "desc" as const } }
                : { store: { rating: "desc" as const } }; // relevance fallback

      const where = {
        isActive: true,
        product: productWhere,
        store: {
          isPublished: true,
          ...(zone && { zone }),
          ...(minRating != null && minRating > 0 && { rating: { gte: minRating } }),
        },
        ...(stores?.length && { storeId: { in: stores } }),
        ...((priceMin != null || priceMax != null) && {
          retailPrice: {
            ...(priceMin != null && { gte: priceMin }),
            ...(priceMax != null && { lte: priceMax }),
          },
        }),
      };

      // ── Ejecutar en paralelo ────────────────────────────────────────────────
      const [rows, total, allForFacets] = await Promise.all([
        prisma.storeProduct.findMany({
          where,
          select: {
            id: true,
            retailPrice: true,
            product: {
              select: {
                id: true,
                name: true,
                image: true,
                category: true,
                unit: true,
                stock: true,
              },
            },
            store: {
              select: {
                id: true,
                slug: true,
                name: true,
                zone: true,
                rating: true,
              },
            },
          },
          orderBy,
          take: limit,
          skip: offset,
        }),
        prisma.storeProduct.count({ where }),
        // Facets: contamos sobre una muestra acotada para no escanear toda la
        // tabla en búsquedas populares. take: 2000 cubre catálogos normales;
        // con >2000 StoreProducts activos los conteos de facets quedan
        // aproximados — aceptable para filtros de UI (Brandon 2026-05-30, audit).
        prisma.storeProduct.findMany({
          where,
          select: {
            storeId: true,
            store: { select: { slug: true, name: true, zone: true } },
            product: { select: { category: true } },
          },
          take: 2000,
        }),
      ]);

      // ── Mapear productos ────────────────────────────────────────────────────
      const products: SearchProduct[] = rows
        .filter((r) => {
          if (!inStock) return true;
          return (r.product.stock ?? 0) > 0;
        })
        .map((r) => ({
          storeProductId: r.id,
          productId: r.product.id,
          name: r.product.name,
          price: toNumOrZero(r.retailPrice),
          image: r.product.image || null,
          unit: r.product.unit,
          category: r.product.category,
          stock: r.product.stock,
          storeId: r.store.id,
          storeSlug: r.store.slug,
          storeName: r.store.name,
          storeZone: r.store.zone,
          storeRating: r.store.rating,
        }));

      // ── Facets de tiendas ───────────────────────────────────────────────────
      const storeMap = new Map<string, StoreFacet>();
      for (const r of allForFacets) {
        const existing = storeMap.get(r.storeId);
        if (existing) {
          existing.count += 1;
        } else {
          storeMap.set(r.storeId, {
            id: r.storeId,
            slug: r.store.slug,
            name: r.store.name,
            count: 1,
            zone: r.store.zone,
          });
        }
      }
      const storesFacet = Array.from(storeMap.values()).sort(
        (a, b) => b.count - a.count,
      );

      // ── Facets de categorías ────────────────────────────────────────────────
      const catMap = new Map<string, number>();
      for (const r of allForFacets) {
        const cat = r.product.category;
        catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
      }
      const categoriesFacet: CategoryFacet[] = Array.from(catMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      return { products, total, storesFacet, categoriesFacet };
    });
  },

  /**
   * Búsqueda de autocompletado — devuelve hasta 8 sugerencias rápidas.
   * Cache de 30s por término (resultados parciales se descartan rápido).
   */
  async autocomplete(q: string): Promise<{
    products: Array<{ id: number; name: string; category: string }>;
    categories: Array<{ name: string }>;
    stores: Array<{ slug: string; name: string }>;
  }> {
    if (!q.trim()) return { products: [], categories: [], stores: [] };

    const cacheKey = `marketplace:autocomplete:${q.trim().toLowerCase()}`;

    return getOrSet(cacheKey, 30, async () => {
      const [products, stores] = await Promise.all([
        prisma.product.findMany({
          where: {
            active: true,
            deletedAt: null,
            name: { contains: q.trim(), mode: "insensitive" },
          },
          select: { id: true, name: true, category: true },
          take: 5,
          orderBy: { name: "asc" },
        }),
        prisma.store.findMany({
          where: {
            isPublished: true,
            name: { contains: q.trim(), mode: "insensitive" },
          },
          select: { slug: true, name: true },
          take: 3,
        }),
      ]);

      // Categorías: dedupe de los productos encontrados + match directo en category
      const catSet = new Set<string>();
      for (const p of products) {
        const normalized = p.category.toLowerCase();
        if (normalized.includes(q.trim().toLowerCase())) {
          catSet.add(p.category);
        }
      }
      const categories = Array.from(catSet)
        .slice(0, 3)
        .map((name) => ({ name }));

      return {
        products: products.slice(0, 4).map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
        })),
        categories,
        stores: stores.map((s) => ({ slug: s.slug, name: s.name })),
      };
    });
  },
};
