import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { toNumOrZero } from "@/lib/decimal-utils";

// Re-export del registro canónico de categorías + tipos desde el archivo
// shared, para preservar compatibilidad con consumidores server-only
// existentes. Los tipos pure y la constante CATEGORIAS viven en
// `lib/constants/marketplace-categories.ts` (sin `server-only`) para que
// client components los importen sin romper el build.
export {
  type CategoriaDef,
  type CatalogProduct,
  type GetByCategoryFilters,
  CATEGORIAS,
  getCategoriaDef,
  listCategoriaSlugs,
} from "@/lib/constants/marketplace-categories";
import {
  CATEGORIAS,
  type CatalogProduct,
  type GetByCategoryFilters,
} from "@/lib/constants/marketplace-categories";

// ─── MarketplaceCatalogDB ────────────────────────────────────────────────────

export const MarketplaceCatalogDB = {
  /**
   * Devuelve productos de tiendas publicadas cuyo `Product.category` matchea
   * alguno de los keywords de la categoría `slug`. Aislamiento:
   *
   *   - Solo `store.isPublished = true`
   *   - Solo `storeProduct.isActive = true`
   *   - Se devuelve 1 row por StoreProduct (un mismo Product puede aparecer
   *     N veces si N tiendas lo venden — eso es intencional en marketplace).
   */
  async getProductsByCategory(
    slug: string,
    filters: GetByCategoryFilters = {},
  ): Promise<{ products: CatalogProduct[]; total: number }> {
    const def = CATEGORIAS[slug];
    if (!def) {
      return { products: [], total: 0 };
    }

    const cacheKey = `marketplace:catalog:${slug}:${JSON.stringify(filters)}`;

    return getOrSet(cacheKey, 120, async () => {
      const {
        stores,
        subCategoria,
        priceMin,
        priceMax,
        inStock,
        minStoreRating,
        zone,
        sort = "relevance",
        limit = 24,
        offset = 0,
      } = filters;

      // Match flexible contra category (puede contener "limpieza", "limpieza-hogar", etc.)
      // Prisma no soporta multi-contains nativo → OR sobre keywords.
      const categoryOR = def.keywords.map((kw) => ({
        category: { contains: kw, mode: "insensitive" as const },
      }));

      const productWhere = {
        active: true,
        deletedAt: null,
        OR: categoryOR,
        ...(subCategoria && {
          AND: [
            {
              OR: [
                { category: { contains: subCategoria, mode: "insensitive" as const } },
                { name: { contains: subCategoria, mode: "insensitive" as const } },
              ],
            },
          ],
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
          ...(minStoreRating != null && { rating: { gte: minStoreRating } }),
        },
        ...(stores?.length && { storeId: { in: stores } }),
        ...((priceMin != null || priceMax != null) && {
          retailPrice: {
            ...(priceMin != null && { gte: priceMin }),
            ...(priceMax != null && { lte: priceMax }),
          },
        }),
      };

      const [rows, total] = await Promise.all([
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
                logo: true,
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
      ]);

      const products: CatalogProduct[] = rows
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
          storeLogo: r.store.logo,
          storeZone: r.store.zone,
          storeRating: r.store.rating,
        }));

      return { products, total };
    });
  },

  /**
   * Devuelve la lista de tiendas que tienen ≥1 producto activo en la categoría.
   * Usado por el filtro "Tiendas" del sidebar.
   */
  async getStoresWithCategory(slug: string): Promise<
    Array<{ id: string; slug: string; name: string; count: number; zone: string | null }>
  > {
    const def = CATEGORIAS[slug];
    if (!def) return [];

    const cacheKey = `marketplace:catalog:${slug}:stores`;

    return getOrSet(cacheKey, 300, async () => {
      const categoryOR = def.keywords.map((kw) => ({
        category: { contains: kw, mode: "insensitive" as const },
      }));

      // 1. Obtener storeProducts activos de la categoría
      const rows = await prisma.storeProduct.findMany({
        where: {
          isActive: true,
          product: {
            active: true,
            deletedAt: null,
            OR: categoryOR,
          },
          store: { isPublished: true },
        },
        select: {
          storeId: true,
          store: { select: { slug: true, name: true, zone: true } },
        },
      });

      // 2. Agrupar por store
      const map = new Map<
        string,
        { id: string; slug: string; name: string; count: number; zone: string | null }
      >();
      for (const r of rows) {
        const existing = map.get(r.storeId);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(r.storeId, {
            id: r.storeId,
            slug: r.store.slug,
            name: r.store.name,
            count: 1,
            zone: r.store.zone,
          });
        }
      }

      return Array.from(map.values()).sort((a, b) => b.count - a.count);
    });
  },
};
