import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getOrSet } from "@/lib/cache";
import { toNumOrZero } from "@/lib/decimal-utils";
import {
  ordenarPorRelevancia,
  type DisponibilidadBuscar,
  type OrdenBuscar,
} from "@/lib/marketplace/buscar-params";

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
  /** Estrellas de la tienda: si ninguna tiene, el filtro de calificación se esconde. */
  rating: number;
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
  /** Stock null = la tienda no lo controla (se hace al pedido): cuenta como disponible. */
  availability?: DisponibilidadBuscar;
  minRating?: number;
  zone?: string | null;
  sort?: OrdenBuscar;
  limit?: number;
  offset?: number;
};

export type SearchResult = {
  products: SearchProduct[];
  total: number;
  storesFacet: StoreFacet[];
  categoriesFacet: CategoryFacet[];
  /** Zonas con tiendas publicadas (no depende del filtro de zona elegido). */
  zonesFacet: string[];
};

/** Tope de la muestra para facetas y para ordenar por relevancia en memoria. */
const MUESTRA_MAX = 2000;

const SELECT_TARJETA = {
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
    select: { id: true, slug: true, name: true, zone: true, rating: true },
  },
} as const satisfies Prisma.StoreProductSelect;

type FilaTarjeta = Prisma.StoreProductGetPayload<{
  select: typeof SELECT_TARJETA;
}>;

function aProducto(r: FilaTarjeta): SearchProduct {
  return {
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
  };
}

/** Disponibilidad en el WHERE (no en JS después del take: total y páginas cuadran). */
function whereDisponibilidad(a: DisponibilidadBuscar | undefined): Prisma.ProductWhereInput | null {
  if (a === "inStock") return { OR: [{ stock: null }, { stock: { gt: 0 } }] };
  if (a === "outOfStock") return { stock: { lte: 0 } };
  return null;
}

// ─── MarketplaceSearchDB ──────────────────────────────────────────────────────

export const MarketplaceSearchDB = {
  /**
   * Búsqueda global de productos en el marketplace.
   *
   * Busca sobre Product.name y Product.category (insensitive).
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
      availability,
      minRating,
      zone,
      sort = "relevance",
      limit = 24,
      offset = 0,
    } = filters;

    const cacheKey = `marketplace:search:${JSON.stringify(filters)}`;

    return getOrSet(cacheKey, 60, async () => {
      // ── Construir where ────────────────────────────────────────────────────
      const termino = q?.trim() ?? "";

      // Cada condición va en su propio AND: antes el OR de categorías pisaba
      // al OR del texto buscado y «arroz» + una categoría ignoraba «arroz».
      const condiciones: Prisma.ProductWhereInput[] = [];
      if (termino) {
        condiciones.push({
          OR: [
            { name: { contains: termino, mode: "insensitive" } },
            { category: { contains: termino, mode: "insensitive" } },
          ],
        });
      }
      if (categories?.length) {
        condiciones.push({
          OR: categories.map((c) => ({
            category: { contains: c, mode: "insensitive" as const },
          })),
        });
      }
      const disponibilidad = whereDisponibilidad(availability);
      if (disponibilidad) condiciones.push(disponibilidad);

      const productWhere: Prisma.ProductWhereInput = {
        active: true,
        deletedAt: null,
        ...(condiciones.length && { AND: condiciones }),
      };

      // `id` desempata: con todas las tiendas en 0 estrellas el orden sin él
      // cambiaba entre consultas y una página repetía productos de otra.
      const orderBy: Prisma.StoreProductOrderByWithRelationInput[] =
        sort === "price_asc"
          ? [{ retailPrice: "asc" }, { id: "asc" }]
          : sort === "price_desc"
            ? [{ retailPrice: "desc" }, { id: "asc" }]
            : sort === "newest"
              ? [{ id: "desc" }]
              : [{ store: { rating: "desc" } }, { id: "asc" }];

      const where: Prisma.StoreProductWhereInput = {
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

      // «Relevancia» con algo escrito se ordena en memoria sobre la muestra
      // (ya se trae para las facetas): no hay viaje extra a la base.
      const porRelevancia = sort === "relevance" && termino !== "";

      // ── Ejecutar en paralelo ────────────────────────────────────────────────
      const [pagina, total, muestra, zonas] = await Promise.all([
        porRelevancia
          ? Promise.resolve<FilaTarjeta[]>([])
          : prisma.storeProduct.findMany({
              where,
              select: SELECT_TARJETA,
              orderBy,
              take: limit,
              skip: offset,
            }),
        prisma.storeProduct.count({ where }),
        // Facets: muestra acotada para no escanear toda la tabla en búsquedas
        // populares. Con >2000 StoreProducts los conteos quedan aproximados
        // (Brandon 2026-05-30, audit) y la relevancia ordena las 2000 mejor
        // calificadas.
        prisma.storeProduct.findMany({
          where,
          select: SELECT_TARJETA,
          orderBy: [{ store: { rating: "desc" } }, { id: "asc" }],
          take: MUESTRA_MAX,
        }),
        prisma.store.findMany({
          where: { isPublished: true, zone: { not: null } },
          select: { zone: true },
          distinct: ["zone"],
          orderBy: { zone: "asc" },
        }),
      ]);

      const filas = porRelevancia
        ? ordenarPorRelevancia(muestra, termino, (r) => ({
            nombre: r.product.name,
            rating: r.store.rating,
          })).slice(offset, offset + limit)
        : pagina;
      const products = filas.map(aProducto);

      // ── Facets de tiendas ───────────────────────────────────────────────────
      const storeMap = new Map<string, StoreFacet>();
      for (const r of muestra) {
        const existing = storeMap.get(r.store.id);
        if (existing) {
          existing.count += 1;
        } else {
          storeMap.set(r.store.id, {
            id: r.store.id,
            slug: r.store.slug,
            name: r.store.name,
            count: 1,
            zone: r.store.zone,
            rating: r.store.rating,
          });
        }
      }
      const storesFacet = Array.from(storeMap.values()).sort((a, b) => b.count - a.count);

      // ── Facets de categorías ────────────────────────────────────────────────
      const catMap = new Map<string, number>();
      for (const r of muestra) {
        const cat = r.product.category;
        catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
      }
      const categoriesFacet: CategoryFacet[] = Array.from(catMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      const zonesFacet = zonas.map((z) => z.zone).filter((z): z is string => !!z);

      return { products, total, storesFacet, categoriesFacet, zonesFacet };
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
