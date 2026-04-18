import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { toNumOrZero } from "@/lib/decimal-utils";

// ─── Category slug registry ──────────────────────────────────────────────────
//
// Mapeo canónico slug → { label, descripcion, sub-categorias, keywords }.
// Cada slug corresponde a una página `/marketplace/categoria/[slug]`. El
// campo `keywords` se matchea (insensitive) contra `Product.category` que es
// un String libre en el schema (ver `prisma/schema.prisma` línea 84).
//
// Los slugs son estables — si se renombra uno hay que mantener el antiguo
// como redirect para no romper SEO.

export type CategoriaDef = {
  slug: string;
  label: string;
  subtitle: string;
  kicker: string;
  /** Sub-categorías usadas por el filtro de sidebar. */
  subCategorias: string[];
  /**
   * Keywords para matchear contra `Product.category` (case-insensitive,
   * substring). El primero se usa también como "canonical category" cuando
   * hay ambigüedad.
   */
  keywords: string[];
  /** Nombre de la ilustración del DS (se resuelve en el componente). */
  illustration:
    | "LimpiezaDomicilio"
    | "BodegaAbriendo"
    | "CarniceriaFresca"
    | "VerduraFresca"
    | "BebidasVarias"
    | "LacteosRefresh"
    | "CorazonLatiendo"
    | "PaicheEnOlla";
};

export const CATEGORIAS: Record<string, CategoriaDef> = {
  "limpieza-hogar": {
    slug: "limpieza-hogar",
    label: "Limpieza & Hogar",
    subtitle:
      "Todo lo que necesitas para tu casa — desde jabones hasta utensilios, en las bodegas cerca tuyo.",
    kicker: "Categoria",
    subCategorias: ["Jabones", "Detergentes", "Utensilios", "Desinfectantes"],
    keywords: ["limpieza", "limpie", "hogar"],
    illustration: "LimpiezaDomicilio",
  },
  abarrotes: {
    slug: "abarrotes",
    label: "Abarrotes",
    subtitle:
      "Arroz, fideos, aceites y enlatados — la despensa completa en un solo lugar.",
    kicker: "Categoria",
    subCategorias: ["Arroz", "Fideos", "Enlatados", "Aceites"],
    keywords: ["abarrote", "abarrotes"],
    illustration: "BodegaAbriendo",
  },
  carnes: {
    slug: "carnes",
    label: "Carniceria",
    subtitle:
      "Pollo, res, cerdo y embutidos frescos todos los dias — directo de las mejores carnicerias.",
    kicker: "Categoria",
    subCategorias: ["Pollo", "Res", "Cerdo", "Embutidos"],
    keywords: ["carne", "carnes", "carniceria"],
    illustration: "CarniceriaFresca",
  },
  "frutas-verduras": {
    slug: "frutas-verduras",
    label: "Frutas & Verduras",
    subtitle:
      "Lo mas fresco del mercado — frutas, verduras y hierbas del dia.",
    kicker: "Categoria",
    subCategorias: ["Frutas", "Verduras", "Hierbas"],
    keywords: ["fruta", "verdura", "frutas-verduras"],
    illustration: "VerduraFresca",
  },
  bebidas: {
    slug: "bebidas",
    label: "Bebidas",
    subtitle:
      "Gaseosas, jugos, aguas y licores — con delivery rapido a tu casa.",
    kicker: "Categoria",
    subCategorias: ["Gaseosas", "Jugos", "Aguas", "Licores"],
    keywords: ["bebida", "bebidas"],
    illustration: "BebidasVarias",
  },
  lacteos: {
    slug: "lacteos",
    label: "Lacteos",
    subtitle:
      "Leche, yogurt, queso y mantequilla — siempre frescos y en oferta.",
    kicker: "Categoria",
    subCategorias: ["Leche", "Yogurt", "Queso", "Mantequilla"],
    keywords: ["lacteo", "lacteos", "lácteo", "lácteos"],
    illustration: "LacteosRefresh",
  },
  panaderia: {
    slug: "panaderia",
    label: "Panaderia",
    subtitle:
      "Pan del dia, pasteles y galletas — de las mejores panaderias de Pucallpa.",
    kicker: "Categoria",
    subCategorias: ["Pan", "Pasteles", "Galletas"],
    keywords: ["panaderia", "panaderia", "pan"],
    illustration: "BodegaAbriendo",
  },
  farmacia: {
    slug: "farmacia",
    label: "Farmacia",
    subtitle:
      "Medicamentos OTC, cuidado personal y productos para bebes — con entrega discreta.",
    kicker: "Categoria",
    subCategorias: ["OTC", "Cuidado personal", "Bebes"],
    keywords: ["farmacia", "medicamento", "cuidado"],
    illustration: "CorazonLatiendo",
  },
};

/**
 * Devuelve la definición de categoría por slug, o `null` si no existe.
 */
export function getCategoriaDef(slug: string): CategoriaDef | null {
  return CATEGORIAS[slug] ?? null;
}

/**
 * Lista todos los slugs conocidos — para generateStaticParams o el menu.
 */
export function listCategoriaSlugs(): string[] {
  return Object.keys(CATEGORIAS);
}

// ─── Producto result type ────────────────────────────────────────────────────

export type CatalogProduct = {
  /** StoreProduct.id (sirve para agregar al carrito multi-tienda) */
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
  storeLogo: string | null;
  storeZone: string | null;
  storeRating: number;
};

export type GetByCategoryFilters = {
  /** Filtrar por storeId (array) */
  stores?: string[];
  /** Sub-categoría exacta (coincidencia parcial sobre Product.category). */
  subCategoria?: string;
  priceMin?: number;
  priceMax?: number;
  /** Solo en stock. */
  inStock?: boolean;
  /** Rating minimo de la tienda (0-5). */
  minStoreRating?: number;
  /** Zona de la tienda (Calleria, Manantay, Yarinacocha, etc.) */
  zone?: string;
  sort?: "relevance" | "price_asc" | "price_desc" | "rating" | "newest";
  limit?: number;
  offset?: number;
};

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
