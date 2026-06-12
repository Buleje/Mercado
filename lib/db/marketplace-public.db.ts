/**
 * lib/db/marketplace-public.db.ts
 *
 * DB class para lecturas PÚBLICAS del marketplace (sin auth requerida).
 *
 * @cross-tenant intentional — ADR-082
 * Los métodos de esta clase operan cross-tenant por diseño: el marketplace
 * agrega productos/órdenes de TODOS los stores publicados. Esto es
 * intencional y diferente del aislamiento single-tenant del ERP.
 * Todos los métodos filtran `store.isPublished: true` y `active: true`
 * para no exponer datos de tiendas en draft ni productos inactivos.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { MARKETPLACE_VERTICALS } from "@/lib/marketplace/verticals";
import { findTenantByIdOrSlug } from "@/lib/tenant";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
// Next 16 Cache Components (ADR-019): cacheLife + cacheTag para
// MarketplaceStatsDB queries (revalidate + tag-invalidation).
import { cacheLife, cacheTag } from "next/cache";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbMarketplaceProduct = {
  id: number;
  name: string;
  description: string | null;
  category: string;
  price: number;
  wholesalePrice: number | null;
  basePrice: number;
  unit: string;
  badge: string | null;
  stock: number | null;
  image: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  images: Array<{ id: string; url: string; alt: string | null; isPrimary: boolean }>;
  variants: Array<{
    id: string;
    name: string;
    sku: string | null;
    priceModifier: number;
    stock: number | null;
    attributesJson: string | null;
  }>;
  storeProductId: string;
  minOrderQty: number | null;
  store: {
    id: string;
    name: string;
    slug: string | null;
    logo: string | null;
    description: string | null;
    zone: string | null;
  };
};

export type DbActivityFeedItem = {
  id: string;
  initial: string;
  name: string;
  zone: string;
  action: "pidió" | "compró";
  product: string;
  minsAgo: number;
};

export type DbCustomerTierCount = {
  count: number;
};

// ── Analytics types (tenant-scoped, requiere auth en el route) ────────────────

export type DbAnalyticsStore = {
  id: string;
  name: string;
  slug: string | null;
  rating: number;
  reviewCount: number;
  createdAt: Date;
};

export type DbOrderAggregate = {
  _count: number;
  _sum: { total: number };
};

export type DbStoreLocation = {
  slug: string;
  name: string;
  lat: number | null;
  lng: number | null;
  zone: string | null;
  logo: string | null;
};

/** Producto del preview de catálogo en el showcase de tiendas destacadas. */
export type StorePreviewProduct = {
  id: string;
  name: string;
  image: string;
  price: number;
};

/** Tienda destacada con vistazo de catálogo (home showcase). */
export type FeaturedStorePreview = {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  banner: string | null;
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
  /** Beneficio "Destacar en Home" (superadmin). */
  featuredHome: boolean;
  /** Total de productos activos de la tienda. */
  productCount: number;
  /** Hasta 4 productos con imagen para el preview. */
  preview: StorePreviewProduct[];
};

// ── MarketplacePublicDB ───────────────────────────────────────────────────────

export const MarketplacePublicDB = {

  /**
   * Devuelve la ubicación pública (lat/lng/zone/logo) de un conjunto de
   * tiendas por slug. Se usa para pintar los markers de "origen" en el
   * mapa del modal de pedido confirmado.
   *
   * @cross-tenant intentional (ADR-082) — el marketplace agrega tiendas de
   * todos los tenants. Sólo expone tiendas con `isPublished: true`.
   * Cache: 300s por slug (la ubicación de una tienda casi nunca cambia).
   */
  async getStoreLocationsBySlugs(slugs: string[]): Promise<DbStoreLocation[]> {
    const safe = slugs
      .filter((s): s is string => typeof s === "string" && /^[a-z0-9-]{2,64}$/.test(s))
      .slice(0, 10);
    if (safe.length === 0) return [];
    const results = await Promise.all(
      safe.map((slug) =>
        getOrSet<DbStoreLocation | null>(`marketplace:store-location:${slug}:v1`, 300, async () => {
          const store = await prisma.store.findUnique({
            where: { slug },
            select: {
              slug: true,
              name: true,
              lat: true,
              lng: true,
              zone: true,
              logo: true,
              isPublished: true,
            },
          });
          if (!store || !store.isPublished) return null;
          return {
            slug: store.slug,
            name: store.name,
            lat: store.lat ?? null,
            lng: store.lng ?? null,
            zone: store.zone ?? null,
            logo: store.logo ?? null,
          };
        }),
      ),
    );
    return results.filter((s): s is DbStoreLocation => s !== null);
  },

  /**
   * Devuelve un producto público del marketplace por ID.
   * Solo retorna si existe al menos una tienda publicada que lo venda.
   * Cache: 120s (producto cambia con poca frecuencia).
   *
   * @cross-tenant intentional (ADR-082) — busca entre todos los stores publicados.
   */
  async getPublicProduct(productId: number): Promise<DbMarketplaceProduct | null> {
    return getOrSet(
      `marketplace:product:${productId}:v1`,
      120,
      async () => {
        const product = await prisma.product.findFirst({
          where: {
            id: productId,
            active: true,
            deletedAt: null,
            storeProducts: {
              some: { isActive: true, store: { isPublished: true } },
            },
          },
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            price: true,
            image: true,
            unit: true,
            badge: true,
            stock: true,
            metaTitle: true,
            metaDescription: true,
            ogImage: true,
            images: {
              where: { url: { not: "" } },
              orderBy: { position: "asc" },
              select: { id: true, url: true, alt: true, isPrimary: true },
            },
            variants: {
              where: { isActive: true },
              orderBy: { position: "asc" },
              select: {
                id: true,
                name: true,
                sku: true,
                priceModifier: true,
                stock: true,
                attributesJson: true,
              },
            },
            storeProducts: {
              where: { isActive: true, store: { isPublished: true } },
              take: 1,
              select: {
                id: true,
                retailPrice: true,
                wholesalePrice: true,
                minOrderQty: true,
                store: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    logo: true,
                    description: true,
                    zone: true,
                  },
                },
              },
            },
          },
        });

        if (!product || product.storeProducts.length === 0) return null;

        const sp = product.storeProducts[0];
        return {
          id: product.id,
          name: product.name,
          description: product.description,
          category: product.category,
          price: Number(sp.retailPrice),
          wholesalePrice: sp.wholesalePrice ? Number(sp.wholesalePrice) : null,
          basePrice: toNumOrZero(product.price),
          unit: product.unit,
          badge: product.badge,
          stock: product.stock,
          image: product.image,
          metaTitle: product.metaTitle,
          metaDescription: product.metaDescription,
          ogImage: product.ogImage,
          images: product.images,
          variants: product.variants.map((v) => ({
            ...v,
            priceModifier: Number(v.priceModifier),
          })),
          storeProductId: sp.id,
          minOrderQty: sp.minOrderQty,
          store: sp.store,
        };
      },
    );
  },

  /**
   * Últimas 10 órdenes anonymizadas para el LiveActivityStrip.
   * Cache: 60s para no martillar la DB.
   *
   * @cross-tenant intentional (ADR-082) — agrega órdenes de todos los tenants.
   */
  async getActivityFeed(): Promise<DbActivityFeedItem[]> {
    return getOrSet(
      "marketplace:activity-feed:v2",
      60,
      async () => {
        const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
        // Round 21 P0-1 fix (Bug Hunter): storefront público leakeaba órdenes
        // POS internas + contaba órdenes borradas en el feed. Filtrar por
        // source="marketplace" + deletedAt:null cierra el data leak.
        const orders = await prisma.order.findMany({
          where: {
            createdAt: { gte: since },
            source: "marketplace",
            deletedAt: null,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            customerName: true,
            createdAt: true,
            items: { select: { name: true }, take: 1 },
          },
        });

        type RawOrder = {
          id: string;
          customerName: string | null;
          createdAt: Date;
          items: Array<{ name: string }>;
        };

        return (orders as unknown as RawOrder[])
          .filter((o) => o.customerName && o.items.length > 0)
          .map((o, idx): DbActivityFeedItem => {
            const firstName = (o.customerName ?? "Vecino").trim().split(/\s+/)[0];
            const initial = firstName.charAt(0).toUpperCase() || "?";
            const minsAgo = Math.max(
              1,
              Math.floor((Date.now() - o.createdAt.getTime()) / 60000),
            );
            return {
              id: String(o.id),
              initial,
              name: firstName,
              zone: "Pucallpa",
              action: idx % 2 === 0 ? "pidió" : "compró",
              product: o.items[0]?.name ?? "un producto",
              minsAgo,
            };
          });
      },
    );
  },

  /**
   * Cuenta pedidos completados del marketplace para un teléfono de cliente.
   * NO filtra por tenantId — cross-tenant por diseño (ADR-082).
   *
   * SECURITY: el route que llama este método DEBE verificar que el
   * phone coincida con la customer-session del solicitante antes de llamar.
   */
  async getCustomerOrderCount(phone: string): Promise<number> {
    return prisma.order.count({
      where: {
        customerPhone: phone,
        source: "marketplace",
        deletedAt: null,
        status: "entregado",
      },
    });
  },

  /**
   * Devuelve el Store asociado a un tenantId para analytics del vendedor.
   * Cache: 300s.
   */
  async getVendorStore(tenantId: string): Promise<DbAnalyticsStore | null> {
    return getOrSet(
      `marketplace:vendor-store:${tenantId}:v1`,
      300,
      async () => {
        const store = await prisma.store.findFirst({
          where: { tenantId },
          select: {
            id: true,
            name: true,
            slug: true,
            rating: true,
            reviewCount: true,
            createdAt: true,
          },
        });
        if (!store) return null;
        return {
          ...store,
          rating: toNumOrZero(store.rating),
        };
      },
    );
  },

  /**
   * Ejecuta todas las queries de analytics del vendor en paralelo.
   * tenantId filtra órdenes al vendor autenticado (NO cross-tenant).
   * storeId filtra métricas de producto del store específico.
   */
  async getVendorAnalytics(
    tenantId: string,
    storeId: string,
    dates: {
      todayStart: Date;
      /** Inicio de la ventana MÓVIL de 30 días (Brandon 2026-06-01, antes mes calendario). */
      windowStart: Date;
      /** Inicio de la ventana de 30 días PREVIA — para el % de crecimiento. */
      prevWindowStart: Date;
      /** 7 días — métrica "esta semana". */
      weekStart: Date;
      /** Inicio del gráfico de ventas diarias (30 días). */
      dailyStart: Date;
    },
  ) {
    const { todayStart, windowStart, prevWindowStart, weekStart, dailyStart } = dates;

    return Promise.all([
      prisma.order.aggregate({
        where: { tenantId, source: "marketplace", deletedAt: null, createdAt: { gte: todayStart } },
        _count: true,
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { tenantId, source: "marketplace", deletedAt: null, createdAt: { gte: windowStart } },
        _count: true,
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { tenantId, source: "marketplace", deletedAt: null, createdAt: { gte: prevWindowStart, lt: windowStart } },
        _count: true,
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { tenantId, source: "marketplace", deletedAt: null, createdAt: { gte: weekStart } },
        _count: true,
        _sum: { total: true },
      }),
      prisma.storeProduct.count({ where: { storeId, isActive: true } }),
      prisma.storeProduct.count({ where: { storeId } }),
      prisma.storeProduct.count({
        where: { storeId, isActive: true, product: { stock: { lte: 5 } } },
      }),
      prisma.order.count({
        where: { tenantId, source: "marketplace", deletedAt: null, status: "pendiente" },
      }),
      prisma.review.count({ where: { storeId, status: "pending" } }),
      prisma.orderItem.groupBy({
        by: ["name"],
        where: {
          order: { tenantId, source: "marketplace", deletedAt: null, createdAt: { gte: windowStart } },
        },
        _sum: { quantity: true, price: true },
        orderBy: { _sum: { price: "desc" } },
        take: 5,
      }),
      prisma.order.findMany({
        where: { tenantId, source: "marketplace", deletedAt: null },
        select: {
          id: true,
          customerName: true,
          total: true,
          status: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.order.groupBy({
        by: ["createdAt"],
        where: {
          tenantId,
          source: "marketplace",
          deletedAt: null,
          createdAt: { gte: dailyStart },
        },
        _sum: { total: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: { tenantId, deletedAt: null, createdAt: { gte: todayStart } },
        _count: true,
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { tenantId, deletedAt: null, createdAt: { gte: windowStart } },
        _count: true,
        _sum: { total: true },
      }),
    ] as const);
  },

  /**
   * Enriquecimiento batch del catálogo: imágenes primarias, conteo de variantes,
   * ratings promedio, y top sellers en los últimos 30 días.
   *
   * tenantId se usa para imágenes/variantes del tenant que sirve el catálogo.
   * @cross-tenant intentional (ADR-082) para storeProducts/ratings cross-store.
   */
  async batchCatalogEnrichment(productIds: number[], tenantId: string) {
    if (productIds.length === 0) {
      return {
        primaryImageMap: new Map<number, string>(),
        variantMap: new Map<number, number>(),
        ratingMap: new Map<number, number>(),
        bestSellerIds: new Set<number>(),
        commentCountMap: new Map<number, number>(),
      };
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [primaryImages, variantCounts, ratingsAgg, topSellers, commentCounts] = await Promise.all([
      prisma.productImage.findMany({
        where: { productId: { in: productIds }, tenantId, isPrimary: true },
        select: { productId: true, url: true },
      }),
      prisma.productVariant.groupBy({
        by: ["productId"],
        where: { productId: { in: productIds }, tenantId, isActive: true },
        _count: { id: true },
      }),
      prisma.review.groupBy({
        by: ["productId"],
        where: {
          productId: { in: productIds },
          tenantId,
          status: "approved",
          deletedAt: null,
        },
        _avg: { rating: true },
      }),
      prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          productId: { in: productIds },
          order: { tenantId, deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: Math.ceil(productIds.length * 0.1) || 1,
      }),
      // Comentarios públicos estilo IG (status='comment', Brandon 2026-06-06)
      // — el card muestra el conteo con icono de globo.
      // @cross-tenant intentional (ADR-082): los comentarios viven en el
      // tenant de la TIENDA dueña, no en el tenant que sirve el catálogo
      // cross-store. Product.id es global → el scope por productId alcanza.
      prisma.review.groupBy({
        by: ["productId"],
        where: {
          productId: { in: productIds },
          status: "comment",
          deletedAt: null,
        },
        _count: { id: true },
      }),
    ]);

    return {
      primaryImageMap: new Map(primaryImages.map((i) => [i.productId, i.url])),
      variantMap: new Map(variantCounts.map((v) => [v.productId, v._count.id])),
      ratingMap: new Map(ratingsAgg.map((r) => [r.productId, r._avg.rating ?? 0])),
      bestSellerIds: new Set(topSellers.map((s) => s.productId)),
      commentCountMap: new Map(commentCounts.map((c) => [c.productId, c._count.id])),
    };
  },

  /**
   * Búsqueda de productos cross-tenant para el endpoint público /marketplace/search.
   * Incluye filtro de tenant.active (SECURITY audit M5) y select shape propio.
   *
   * @cross-tenant intentional (ADR-082).
   */
  async searchProducts(opts: {
    q: string;
    zone?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    sort: "price_asc" | "price_desc" | "name" | "rating" | "distance";
    limit?: number;
  }) {
    const orderBy =
      opts.sort === "price_desc"  ? { retailPrice: "desc" as const }
      : opts.sort === "name"      ? { product: { name: "asc" as const } }
      : opts.sort === "rating"    ? { store: { rating: "desc" as const } }
      : { retailPrice: "asc" as const }; // price_asc | distance | default

    return prisma.storeProduct.findMany({
      where: {
        isActive: true,
        ...((opts.minPrice !== undefined || opts.maxPrice !== undefined) && {
          retailPrice: {
            ...(opts.minPrice !== undefined && { gte: opts.minPrice }),
            ...(opts.maxPrice !== undefined && { lte: opts.maxPrice }),
          },
        }),
        store: {
          isPublished: true,
          tenant: { active: true },
          ...(opts.zone && { zone: opts.zone }),
        },
        product: {
          name: { contains: opts.q, mode: "insensitive" as const },
          ...(opts.category && opts.category !== "todos" && { category: opts.category }),
        },
      },
      select: {
        id:          true,
        retailPrice: true,
        minOrderQty: true,
        product: {
          select: { id: true, name: true, image: true, category: true, unit: true, stock: true },
        },
        store: {
          select: { id: true, name: true, slug: true, logo: true, zone: true, rating: true },
        },
      },
      orderBy,
      take: opts.limit ?? 80,
    });
  },

  /**
   * getProductCategories — categorías de PRODUCTO distintas presentes en el
   * marketplace (tiendas publicadas + activas), ordenadas por cantidad de
   * productos. Alimenta el subnav mobile de categorías (Brandon 2026-05-27):
   * solo devuelve categorías con ≥1 producto real → cero chips muertos.
   *
   * Preserva el valor EXACTO de `product.category` (sin lowercasing) porque el
   * filtro de /marketplace/buscar?cat= hace match exacto contra ese valor.
   * Cacheado 300s.
   *
   * @cross-tenant intentional (ADR-082).
   */
  async getProductCategories(
    storeCategories?: string[],
  ): Promise<Array<{ id: string; count: number }>> {
    // Tanda mobile (Brandon 2026-06-11): cuando se pasa `storeCategories` (las
    // categorías de tienda de un vertical), las subcategorías se acotan a los
    // productos de esas tiendas → la barra de subcategorías depende del vertical
    // elegido arriba. Sin el param = todo el catálogo (comportamiento original).
    const scope = storeCategories?.map((c) => c.trim().toLowerCase()).filter(Boolean) ?? null;
    const cacheKey = scope?.length
      ? `marketplace:product-categories:v2:scope:${[...scope].sort().join(",")}`
      : "marketplace:product-categories:v2";
    return getOrSet(cacheKey, 300, async () => {
      // store.category es case-inconsistente ("Abarrotes" vs "bodega") → OR de
      // equals insensitive (Prisma `in` no soporta mode insensitive).
      const storeWhere = scope?.length
        ? {
            isPublished: true,
            tenant: { active: true },
            OR: scope.map((c) => ({ category: { equals: c, mode: "insensitive" as const } })),
          }
        : { isPublished: true, tenant: { active: true } };
      // Audit 2026-06-10 P2: antes findMany take:10000 traía hasta 10k filas
      // para contar ~15 categorías en JS. groupBy agrega en la DB y devuelve
      // ~1 fila por variante de categoría. Nota: ahora cuenta productos
      // distintos (no pares producto×tienda) — solo afecta el orden relativo
      // de los chips, no qué chips existen.
      const rows = await prisma.product.groupBy({
        by: ["category"],
        where: {
          active: true,
          deletedAt: null,
          storeProducts: {
            some: { isActive: true, store: storeWhere },
          },
        },
        _count: { _all: true },
      });
      // Dedupe CASE-INSENSITIVE: distintas tiendas guardan "bebidas" vs
      // "Bebidas" — se agrupan en un solo chip. El filtro de /buscar usa
      // `contains` insensitive, así que el id en minúsculas matchea todas las
      // variantes. La key minúscula también alimenta el ícono canónico.
      const counts = new Map<string, number>();
      for (const r of rows) {
        const cat = r.category?.trim();
        if (!cat) continue;
        const key = cat.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + (r._count?._all ?? 0));
      }
      return [...counts.entries()]
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count);
    });
  },

  /**
   * Verifica qué product IDs existen en el marketplace (cross-store o tenant-scoped).
   * Caso de uso: validación defensiva del carrito para no eliminar items válidos.
   * Cap: 100 IDs por llamada.
   *
   * Si tenantId se provee → filtra solo productos de ese tenant.
   * Sin tenantId → cross-store (todos los tenants, active=true).
   *
   * @cross-tenant intentional cuando tenantId es null (ADR-082).
   */
  async checkProductsExist(
    productIds: number[],
    tenantId: string | null,
  ): Promise<{ existingIds: number[]; missingIds: number[] }> {
    if (productIds.length === 0) return { existingIds: [], missingIds: [] };

    const found = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        active: true,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true },
    });

    const existingIds = found.map((p) => p.id);
    const foundSet = new Set(existingIds);
    const missingIds = productIds.filter((id) => !foundSet.has(id));
    return { existingIds, missingIds };
  },

  /**
   * Resuelve slug de tenant → tenantId para el endpoint check-exists.
   * No exponemos datos sensibles — solo retorna el id.
   * Round 7: cache 300s — slugs no cambian, evita martillar DB en hot paths.
   */
  async resolveTenantIdBySlug(slugOrId: string): Promise<string | null> {
    return getOrSet(`marketplace:resolve-tenant:${slugOrId}`, 300, async () => {
      // Brandon 2026-05-16 (Fase 3): helper memoizado con React.cache.
      const tenant = await findTenantByIdOrSlug(slugOrId);
      return tenant?.id ?? null;
    });
  },

  /**
   * Ranking de productos más pedidos en las últimas 24h en el marketplace.
   * Fallback a últimos 7d si hay menos de 5 resultados.
   * Incluye trendPct: variación % vs el mismo período anterior.
   * Cache: 120s (mismo TTL que los headers del route).
   *
   * @cross-tenant intentional (ADR-082) — agrega OrderItems de todos los tenants.
   */
  async getTopToday(limit: number): Promise<{
    items: Array<{
      storeProductId: string;
      productId: number;
      name: string;
      price: number;
      originalPrice: number | null;
      image: string | null;
      unit: string;
      category: string | null;
      stock: number;
      soldUnits: number;
      trendPct: number | null;
      store: { id: string; slug: string; name: string; rating: number; logo: string | null };
    }>;
    window: "24h" | "7d";
    updatedAt: string;
  }> {
    const now = new Date();
    // Round 7 fix: cache key estable. El bucket `Math.floor(now/120_000)` mezclado
    // con TTL 120s generaba una key nueva por bucket sin desalojar la anterior →
    // memory leak en getOrSet. El TTL solo ya garantiza refresh cada 120s.
    //
    // @cross-tenant intentional — agrega ventas de TODOS los tenants para el
    // feed "Top del día" del marketplace global. NO incluye tenantId en la key
    // a propósito (audit P1-2 fix 2026-05-11). Ver ADR-082.
    const cacheKey = `marketplace:top-today:v1:${limit}`;

    return getOrSet(cacheKey, 120, async () => {
      const start24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const start48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const start7d  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
      const start14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      async function topInWindow(fromDate: Date, toDate?: Date) {
        return prisma.orderItem.groupBy({
          by: ["productId"],
          where: {
            order: {
              source: "marketplace",
              deletedAt: null,
              createdAt: { gte: fromDate, ...(toDate ? { lt: toDate } : {}) },
            },
          },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: limit,
        });
      }

      let window: "24h" | "7d" = "24h";
      let ranking = await topInWindow(start24h).catch(() => []);
      let prevWindow = { from: start48h, to: start24h };

      if (ranking.length < 5) {
        window = "7d";
        ranking = await topInWindow(start7d).catch(() => []);
        prevWindow = { from: start14d, to: start7d };
      }

      if (ranking.length === 0) {
        return { items: [], window, updatedAt: now.toISOString() };
      }

      const currentProductIds = ranking
        .map((r) => r.productId)
        .filter((x): x is number => x != null);

      const prevRanking = await prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          productId: { in: currentProductIds },
          order: {
            source: "marketplace",
            deletedAt: null,
            createdAt: { gte: prevWindow.from, lt: prevWindow.to },
          },
        },
        _sum: { quantity: true },
      }).catch(() => []);

      const prevQtyMap = new Map<number, number>(
        prevRanking
          .filter((r) => r.productId != null)
          .map((r) => [r.productId as number, Number(r._sum.quantity ?? 0)]),
      );

      const productIds = ranking
        .map((r) => r.productId)
        .filter((x): x is number => x != null && typeof x === "number");

      const storeProducts = await prisma.storeProduct.findMany({
        where: {
          productId: { in: productIds },
          isActive: true,
          store: { isPublished: true, vacationMode: { not: true } },
        },
        select: {
          id: true,
          retailPrice: true,
          productId: true,
          product: { select: { id: true, name: true, image: true, unit: true, stock: true, price: true, category: true } },
          store: { select: { id: true, slug: true, name: true, rating: true, logo: true } },
        },
      });

      const bestByProduct = new Map<number, (typeof storeProducts)[number]>();
      for (const sp of storeProducts) {
        const prev = bestByProduct.get(sp.productId);
        if (!prev || (sp.store.rating ?? 0) > (prev.store.rating ?? 0)) {
          bestByProduct.set(sp.productId, sp);
        }
      }

      const items = ranking
        .map((r) => {
          if (r.productId == null) return null;
          const sp = bestByProduct.get(r.productId);
          if (!sp) return null;
          const soldNow  = Number(r._sum.quantity ?? 0);
          const soldPrev = prevQtyMap.get(r.productId) ?? null;
          const trendPct: number | null =
            soldPrev != null && soldPrev > 0
              ? Math.round(((soldNow - soldPrev) / soldPrev) * 100)
              : null;
          const retail = Number(sp.retailPrice);
          const base = sp.product.price != null ? Number(sp.product.price) : null;
          return {
            storeProductId: sp.id,
            productId: sp.productId,
            name: sp.product.name,
            price: retail,
            originalPrice: base != null && base > retail ? base : null,
            image: sp.product.image,
            unit: sp.product.unit,
            category: sp.product.category ?? null,
            stock: sp.product.stock ?? 0,
            soldUnits: soldNow,
            trendPct,
            store: {
              id: sp.store.id,
              slug: sp.store.slug,
              name: sp.store.name,
              rating: Number(sp.store.rating ?? 0),
              logo: sp.store.logo ?? null,
            },
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      return { items, window, updatedAt: now.toISOString() };
    });
  },

  /**
   * Productos en oferta cross-store (retailPrice < product.price base).
   * Sin mocks. Con fallbackToLowest=true devuelve los más baratos como "destacados".
   * Cache: 120s.
   *
   * @cross-tenant intentional (ADR-082) — agrega StoreProducts de todos los stores publicados.
   */
  async getDeals(opts: {
    category?: string;
    storeSlug?: string;
    minDiscount: number;
    limit: number;
    sort: "discount_desc" | "price_asc" | "ends_soon";
    fallbackToLowest: boolean;
  }): Promise<{
    items: Array<{
      id: string;
      productId: number;
      name: string;
      image: string | null;
      category: string;
      unit: string;
      badge: string | null;
      price: number;
      originalPrice: number | null;
      discountPct: number;
      stock: number;
      minOrderQty: number | null;
      store: { slug: string; name: string; logo: string | null; zone: string | null; category: string };
    }>;
    source: "deals" | "lowest";
  }> {
    const { category, storeSlug, minDiscount, limit, sort, fallbackToLowest } = opts;
    const cacheKey = `marketplace:deals:${JSON.stringify({ category, storeSlug, minDiscount, limit, sort, fallbackToLowest })}`;

    return getOrSet(cacheKey, 120, async () => {
      const rows = await prisma.storeProduct.findMany({
        where: {
          isActive: true,
          store: {
            isPublished: true,
            ...(storeSlug && { slug: storeSlug }),
          },
          ...(category
            ? { product: { category, active: true, deletedAt: null } }
            : { product: { active: true, deletedAt: null } }),
        },
        select: {
          id: true,
          retailPrice: true,
          minOrderQty: true,
          store: {
            select: { id: true, slug: true, name: true, logo: true, zone: true, category: true },
          },
          product: {
            select: {
              id: true, name: true, image: true, category: true,
              unit: true, price: true, stock: true, badge: true,
            },
          },
        },
        take: Math.max(limit * 4, 200),
      });

      type DealItem = {
        id: string; productId: number; name: string; image: string | null;
        category: string; unit: string; badge: string | null; price: number;
        originalPrice: number | null; discountPct: number; stock: number;
        minOrderQty: number | null;
        store: { slug: string; name: string; logo: string | null; zone: string | null; category: string };
      };

      const deals: DealItem[] = rows
        .map((sp): DealItem | null => {
          const base = Number(sp.product.price);
          const sale = Number(sp.retailPrice);
          if (!Number.isFinite(base) || !Number.isFinite(sale) || base <= 0) return null;
          if (sale >= base) return null;
          const discountPct = Math.round(((base - sale) / base) * 100);
          if (discountPct < minDiscount) return null;
          return {
            id: sp.id, productId: sp.product.id, name: sp.product.name,
            image: sp.product.image || null, category: sp.product.category,
            unit: sp.product.unit, badge: sp.product.badge ?? null,
            price: sale, originalPrice: base, discountPct,
            stock: sp.product.stock ?? 0, minOrderQty: sp.minOrderQty,
            store: { slug: sp.store.slug, name: sp.store.name, logo: sp.store.logo, zone: sp.store.zone, category: sp.store.category },
          };
        })
        .filter((d): d is DealItem => d !== null);

      const sorted = [...deals].sort((a, b) =>
        sort === "price_asc" ? a.price - b.price : b.discountPct - a.discountPct,
      );

      if (sorted.length > 0 || !fallbackToLowest) {
        return { items: sorted.slice(0, limit), source: "deals" as const };
      }

      const featured: DealItem[] = rows
        .map((sp): DealItem | null => {
          const sale = Number(sp.retailPrice);
          if (!Number.isFinite(sale) || sale <= 0) return null;
          return {
            id: sp.id, productId: sp.product.id, name: sp.product.name,
            image: sp.product.image || null, category: sp.product.category,
            unit: sp.product.unit, badge: sp.product.badge ?? null,
            price: sale, originalPrice: null, discountPct: 0,
            stock: sp.product.stock ?? 0, minOrderQty: sp.minOrderQty,
            store: { slug: sp.store.slug, name: sp.store.name, logo: sp.store.logo, zone: sp.store.zone, category: sp.store.category },
          };
        })
        .filter((d): d is DealItem => d !== null)
        .sort((a, b) => a.price - b.price)
        .slice(0, limit);

      return { items: featured, source: "lowest" as const };
    });
  },

  /**
   * Conteo de pedidos marketplace por tienda (tenantId) en los últimos 30 días.
   * Una sola query groupBy — sin N+1. Resultado: Map<tenantId, orderCount>.
   * Cache: 120s (mismo TTL que el listado de tiendas).
   *
   * @cross-tenant intentional (ADR-082) — ranking de popularidad cross-store.
   */
  async getStorePopularity30d(): Promise<Map<string, number>> {
    return getOrSet("marketplace:store-popularity-30d:v1", 120, async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const rows = await prisma.order.groupBy({
        by: ["tenantId"],
        where: {
          source: "marketplace",
          deletedAt: null,
          createdAt: { gte: since },
        },
        _count: { _all: true },
      }).catch((err: unknown) => {
        logger.warn("[marketplace] getStorePopularity30d failed", { error: String(err) });
        return [] as Array<{ tenantId: string; _count: { _all: number } }>;
      });
      const map = new Map<string, number>();
      for (const row of rows) {
        map.set(row.tenantId, row._count._all);
      }
      return map;
    });
  },

  /**
   * Métricas en vivo del marketplace para el LiveStats banner.
   * Cache: 60s — suficiente para sensación de "live" sin martillar la DB.
   *
   * @cross-tenant intentional (ADR-082) — agrega órdenes/stores de todos los tenants.
   */
  async getLiveStats(): Promise<{
    ordersToday: number;
    shoppersToday: number;
    activeStores: number;
    avgDeliveryMin: number;
  }> {
    // @cross-tenant intentional — KPIs públicos del marketplace global
    // (órdenes today, shoppers, stores activos). Sin tenantId en la key
    // a propósito (audit P1-2 fix 2026-05-11). Ver ADR-082.
    return getOrSet("marketplace:live-stats:v2", 60, async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      // Round 21 P0-1 fix (Bug Hunter): KPIs públicos contaban órdenes POS
      // internas + soft-deleted. Cierra el data leak con source/deletedAt.
      const [ordersTodayRaw, customersTodayRaw, activeStoresRaw] = await Promise.all([
        prisma.order.count({
          where: {
            createdAt: { gte: since },
            source: "marketplace",
            deletedAt: null,
          },
        }),
        prisma.order.findMany({
          where: {
            createdAt: { gte: since },
            source: "marketplace",
            deletedAt: null,
          },
          select: { customerPhone: true },
          distinct: ["customerPhone"],
        }),
        prisma.store.count({ where: { isPublished: true } }),
      ]);
      return {
        ordersToday: ordersTodayRaw,
        shoppersToday: customersTodayRaw.filter((c) => c.customerPhone).length,
        activeStores: activeStoresRaw,
        avgDeliveryMin: 25,
      };
    });
  },

  /**
   * Catálogo unificado paginado con cursor.
   * @cross-tenant intentional (ADR-082) — agrega storeProducts de todos los stores publicados.
   *
   * audit P0 #5 (Brandon 2026-05-18): cache `getOrSet` con TTL 60s.
   * Antes cada hit golpeaba la DB. Hot-path del marketplace. Key se
   * deriva de opts (sin user-data) — seguro para cross-tenant porque
   * el query ya filtra publicado/activo. Coincide con `Cache-Control`
   * del route (`max-age=60`).
   */
  async getCatalogPage(opts: {
    q?: string;
    category?: string;
    /** Vertical: filtra por TIPO de tienda (Store.category), case-insensitive.
        Lo arma el API desde lib/marketplace/verticals.ts. */
    storeCategories?: string[];
    storeSlug?: string;
    zone?: string;
    minPrice?: number;
    maxPrice?: number;
    sort: "popular" | "price_asc" | "price_desc" | "newest" | "rating";
    cursor?: string;
    limit: number;
  }) {
    // Cache key estable y compacta: solo campos que afectan la query.
    const cacheKey =
      "marketplace:catalog:" +
      [
        opts.q ?? "",
        opts.category ?? "",
        (opts.storeCategories ?? []).join(",").toLowerCase(),
        opts.storeSlug ?? "",
        opts.zone ?? "",
        opts.minPrice ?? "",
        opts.maxPrice ?? "",
        opts.sort,
        opts.cursor ?? "",
        opts.limit,
      ].join("|");

    return getOrSet(cacheKey, 60, async () => {
      const orderBy =
        opts.sort === "price_desc"
          ? { retailPrice: "desc" as const }
          : opts.sort === "price_asc"
            ? { retailPrice: "asc" as const }
            : opts.sort === "newest"
              ? { id: "desc" as const }
              : { store: { rating: "desc" as const } };

      const where = {
        isActive: true,
        store: {
          isPublished: true,
          vacationMode: { not: true },
          tenant: { active: true },
          ...(opts.zone && { zone: opts.zone }),
          ...(opts.storeSlug && { slug: opts.storeSlug }),
          // Vertical → filtra por tipo de tienda. Case-insensitive vía OR de
          // equals (Prisma no soporta `in` con mode:insensitive). La data tiene
          // valores como "Abarrotes"/"bodega"/"polleria" sin normalizar.
          ...(opts.storeCategories &&
            opts.storeCategories.length > 0 && {
              OR: opts.storeCategories.map((c) => ({
                category: { equals: c, mode: "insensitive" as const },
              })),
            }),
        },
        ...(opts.q && {
          product: { name: { contains: opts.q, mode: "insensitive" as const } },
        }),
        ...(opts.category &&
          opts.category !== "todos" && {
            product: {
              ...((opts.q && { name: { contains: opts.q, mode: "insensitive" as const } }) || {}),
              category: opts.category,
            },
          }),
        ...((opts.minPrice !== undefined || opts.maxPrice !== undefined) && {
          retailPrice: {
            ...(opts.minPrice !== undefined && { gte: opts.minPrice }),
            ...(opts.maxPrice !== undefined && { lte: opts.maxPrice }),
          },
        }),
      };

      return prisma.storeProduct.findMany({
        where,
        select: {
          id: true,
          retailPrice: true,
          minOrderQty: true,
          product: {
            select: { id: true, name: true, image: true, category: true, unit: true, stock: true },
          },
          store: {
            select: { id: true, name: true, slug: true, logo: true, zone: true, rating: true, category: true },
          },
        },
        orderBy,
        take: opts.limit + 1,
        ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
      });
    });
  },
};

// ── MarketplaceAdminDB ────────────────────────────────────────────────────────

/**
 * Queries administrativas del marketplace (requieren auth en el route).
 * Los métodos cross-tenant son intencionales: el superadmin ve toda la
 * plataforma. Todos están marcados @cross-tenant intentional.
 */
export const MarketplaceAdminDB = {

  /**
   * Overview global del marketplace para el superadmin.
   * @cross-tenant intentional — agrega datos de TODOS los tenants.
   * Cache: NO — datos financieros deben ser siempre frescos.
   */
  async getPlatformOverview() {
    const now = new Date();
    const todayStart    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalStores, activeStores, pendingStores,
      todayOrders, monthOrders, prevMonthOrders, pendingOrders,
      totalCommissions, topStores, recentOrders,
    ] = await Promise.all([
      prisma.store.count(),
      prisma.store.count({ where: { isPublished: true } }),
      prisma.store.count({ where: { isPublished: false } }),
      prisma.order.aggregate({
        where: { source: "marketplace", deletedAt: null, createdAt: { gte: todayStart } },
        _count: true, _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { source: "marketplace", deletedAt: null, createdAt: { gte: monthStart } },
        _count: true, _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { source: "marketplace", deletedAt: null, createdAt: { gte: prevMonthStart, lt: monthStart } },
        _count: true, _sum: { total: true },
      }),
      prisma.order.count({
        where: { source: "marketplace", deletedAt: null, status: "pendiente" },
      }),
      prisma.commissionLedger.aggregate({
        where: { createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      prisma.order.groupBy({
        by: ["tenantId"],
        where: { source: "marketplace", deletedAt: null, createdAt: { gte: monthStart } },
        _sum: { total: true }, _count: true,
        orderBy: { _sum: { total: "desc" } },
        take: 5,
      }),
      prisma.order.findMany({
        where: { source: "marketplace", deletedAt: null },
        select: { id: true, customerName: true, total: true, status: true, createdAt: true, tenantId: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // Batch-resolve store names por tenantId
    const allTenantIds = [
      ...new Set([
        ...topStores.map((s) => s.tenantId),
        ...recentOrders.map((o) => o.tenantId),
      ]),
    ];
    const stores = allTenantIds.length > 0
      ? await prisma.store.findMany({
          where: { tenantId: { in: allTenantIds } },
          select: { tenantId: true, name: true, slug: true },
        })
      : [];
    const storeMap = new Map(stores.map((s) => [s.tenantId, s]));

    return {
      todayStart, monthStart, prevMonthStart,
      totalStores, activeStores, pendingStores,
      todayOrders, monthOrders, prevMonthOrders, pendingOrders,
      totalCommissions, topStores, recentOrders, storeMap,
    };
  },

  /**
   * Órdenes del marketplace para el admin del tenant.
   * tenantId requerido — NO cross-tenant.
   */
  async getOrdersForAdmin(tenantId: string) {
    const orders = await prisma.order.findMany({
      where: { tenantId, source: "marketplace", deletedAt: null },
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        customerLocation: true,
        customerReference: true,
        total: true,
        status: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return orders;
  },

  /**
   * KPIs del marketplace para el panel del vendedor.
   * storeId debe pertenecer al tenantId (verificado en el route).
   */
  async getVendorKpis(tenantId: string, storeId: string) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [publishedProducts, monthOrders, pendingCommissions] = await Promise.all([
      prisma.storeProduct.count({ where: { storeId, isActive: true } }),
      prisma.order.count({
        where: { tenantId, source: "marketplace", deletedAt: null, createdAt: { gte: monthStart } },
      }),
      prisma.commissionLedger.aggregate({
        where: { storeId, status: "pending" },
        _sum: { amount: true },
      }),
    ]);

    return {
      publishedProducts,
      monthOrders,
      pendingCommissions: toNumOrZero(pendingCommissions._sum.amount),
    };
  },

  /**
   * Detalle público completo de una tienda por slug.
   * Incluye vacationMode/vacationMessage y _count de productos activos.
   * Cache: 120s.
   *
   * @cross-tenant intentional — el slug ES el discriminador público.
   */
  async getStoreDetailBySlug(slug: string) {
    return getOrSet(`marketplace:store-detail:${slug}:v1`, 120, async () => {
      return prisma.store.findUnique({
        where: { slug },
        select: {
          id: true, slug: true, name: true, description: true,
          logo: true, banner: true, category: true, zone: true,
          rating: true, reviewCount: true, isPublished: true,
          vacationMode: true, vacationMessage: true, createdAt: true,
          tenant: { select: { slug: true } },
          _count: { select: { products: { where: { isActive: true } } } },
        },
      });
    });
  },

  /**
   * Slug de la tienda asociada a un tenantId (para derivar URL en pedidos).
   * Cache: 300s (cambia raramente).
   */
  async getStoreSlugByTenantId(tenantId: string): Promise<string | null> {
    return getOrSet(`marketplace:store-slug-by-tenant:${tenantId}:v1`, 300, async () => {
      const store = await prisma.store.findFirst({
        where: { tenantId },
        select: { slug: true },
      });
      return store?.slug ?? null;
    });
  },

  /**
   * Secciones curadas para el home del marketplace.
   * Cache: 120s.
   *
   * @cross-tenant intentional — agrega productos de todos los stores publicados.
   */
  async getCatalogSections() {
    return getOrSet("marketplace:catalog-sections:v2", 120, async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const baseStoreFilter = {
        isPublished: true,
        vacationMode: { not: true as const },
      };

      const baseSelect = {
        id: true,
        retailPrice: true,
        product: {
          select: { id: true, name: true, image: true, category: true, unit: true, stock: true },
        },
        store: {
          select: { id: true, name: true, slug: true, logo: true, rating: true },
        },
      } as const;

      const [featuredRaw, topSellerData, lowStockRaw, flashDealRaw] = await Promise.all([
        prisma.storeProduct.findMany({
          where: { isActive: true, store: { ...baseStoreFilter, rating: { gte: 4 } }, product: { stock: { gt: 0 } } },
          select: baseSelect,
          orderBy: { store: { rating: "desc" } },
          take: 8,
        }),
        prisma.orderItem.groupBy({
          by: ["productId"],
          where: { order: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 6,
        }),
        prisma.storeProduct.findMany({
          where: { isActive: true, store: baseStoreFilter, product: { stock: { gt: 0, lte: 3 } } },
          select: baseSelect,
          orderBy: { product: { stock: "asc" } },
          take: 8,
        }),
        prisma.storeProduct.findMany({
          where: { isActive: true, store: baseStoreFilter, product: { stock: { gt: 0 }, active: true } },
          select: baseSelect,
          orderBy: { product: { id: "desc" } },
          take: 8,
        }),
      ]);

      const topSellerIds = topSellerData
        .map((t) => t.productId)
        .filter((id): id is number => id !== null);

      const topSellerProducts = topSellerIds.length > 0
        ? await prisma.storeProduct.findMany({
            where: { isActive: true, store: baseStoreFilter, product: { id: { in: topSellerIds }, stock: { gt: 0 } } },
            select: baseSelect,
            take: 6,
          })
        : [];

      const topSellerMap = new Map(topSellerData.map((t, i) => [t.productId, i]));
      const sortedTopSellers = [...topSellerProducts].sort(
        (a, b) => (topSellerMap.get(a.product.id) ?? 99) - (topSellerMap.get(b.product.id) ?? 99),
      );

      return { featuredRaw, flashDealRaw, sortedTopSellers, lowStockRaw };
    });
  },
};

// ── MarketplaceStatsDB ─────────────────────────────────────────────────────────
//
// Brandon 2026-05-20 audit-sprint: queries de estadísticas públicas cross-tenant
// (home, /negocios, JSON-LD). Antes vivían como `prisma.*` directo en
// `app/(store)/page.tsx` y `app/(store)/negocios/page.tsx` con eslint-disable.
// Movido aquí para cumplir regla #1 CLAUDE.md (solo `lib/db/*` accede a prisma)
// y centralizar cache: cacheLife + cacheTag homogéneo.
//
// @cross-tenant intentional — agrega TODA la plataforma. No requiere tenantId.

export const MarketplaceStatsDB = {
  /**
   * Estadísticas globales del marketplace: tiendas, productos y rating promedio.
   * Cache: 5 min revalidate, 1 min stale, 15 min expire.
   */
  async getPublicMarketplaceStats(): Promise<{
    storeCount: number;
    productCount: number;
    avgRating: number;
  }> {
    "use cache";
    cacheLife({ revalidate: 300, stale: 60, expire: 900 });
    cacheTag("marketplace-stats");

    const [storeCount, productCount, avgRatingRaw] = await Promise.all([
       
      prisma.store.count({ where: { isPublished: true } }).catch(() => 0),
       
      prisma.product.count({ where: { active: true } }).catch(() => 0),
       
      prisma.review
        .aggregate({ _avg: { rating: true }, where: { status: "approved" } })
        .then((r) => r._avg.rating ?? 4.8)
        .catch(() => 4.8),
    ]);

    return {
      storeCount,
      productCount,
      avgRating: Number(Number(avgRatingRaw).toFixed(1)),
    };
  },

  /**
   * Top tiendas publicadas ordenadas por rating + reviewCount.
   * Cache: 10 min revalidate, 2 min stale, 30 min expire.
   */
  async getTopMarketplaceStores(limit: number = 6): Promise<
    Array<{
      id: string;
      slug: string;
      name: string;
      logo: string | null;
      category: string;
      zone: string | null;
      rating: number;
      reviewCount: number;
      /** Beneficio "Destacar en Home" (superadmin): aparece y sube en el home. */
      featuredHome: boolean;
    }>
  > {
    "use cache";
    cacheLife({ revalidate: 600, stale: 120, expire: 1800 });
    cacheTag("marketplace-top-stores");
    const SELECT = {
      id: true, slug: true, name: true, logo: true,
      category: true, zone: true, rating: true, reviewCount: true,
    } as const;
    try {
       
      const top = await prisma.store.findMany({
        where: { isPublished: true },
        orderBy: [{ rating: "desc" }, { reviewCount: "desc" }],
        take: limit,
        select: SELECT,
      });

      // IDs con beneficio "Destacar en Home" (jsonb fuera del schema Prisma).
      let featuredIds: string[] = [];
      try {
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM "Store" WHERE "isPublished"=true AND COALESCE((benefits->>'featuredHome')::boolean, false)=true`,
        );
        featuredIds = rows.map((r) => r.id);
      } catch { /* sin columna benefits → ninguno destacado */ }

      // Traer las destacadas que no estén ya en el top (para que SIEMPRE aparezcan).
      const topIds = new Set(top.map((s) => s.id));
      const missing = featuredIds.filter((id) => !topIds.has(id));
      let extra: typeof top = [];
      if (missing.length > 0) {
         
        extra = await prisma.store.findMany({
          where: { id: { in: missing }, isPublished: true },
          select: SELECT,
        });
      }

      const featuredSet = new Set(featuredIds);
      const all = [...top, ...extra].map((s) => ({ ...s, featuredHome: featuredSet.has(s.id) }));
      // Destacadas primero, luego por rating.
      all.sort((a, b) => {
        if (a.featuredHome !== b.featuredHome) return a.featuredHome ? -1 : 1;
        return b.rating - a.rating;
      });
      return all.slice(0, limit + extra.length);
    } catch {
      return [];
    }
  },

  /**
   * Slugs de categoría (`Store.category`) con ≥1 tienda PUBLICADA.
   * Alimenta el filtro de la grilla de Categorías en la home: solo mostramos
   * rubros vinculados a tiendas reales (cero categorías muertas).
   * Devuelve los valores TAL CUAL están en la DB; el caller normaliza el casing.
   * Cache: 10 min revalidate, 2 min stale, 30 min expire.
   *
   * @cross-tenant intentional (ADR-082) — agrega tiendas de todos los tenants.
   */
  async getActiveStoreCategorySlugs(): Promise<string[]> {
    "use cache";
    cacheLife({ revalidate: 600, stale: 120, expire: 1800 });
    cacheTag("marketplace-top-stores");
    try {

      const rows = await prisma.store.findMany({
        where: { isPublished: true },
        select: { category: true },
        distinct: ["category"],
      });
      return rows
        .map((r) => (r.category ?? "").trim())
        .filter((c) => c.length > 0);
    } catch {
      return [];
    }
  },

  /**
   * Verticales del Inicio que TIENEN tiendas publicadas (Brandon 2026-06-11).
   * Cruza las categorías de tienda activas con cada vertical. Si devuelve ≤1,
   * la UI oculta la fila de chips de vertical (no hay nada que elegir).
   */
  async getActiveVerticals(): Promise<string[]> {
    const slugs = await this.getActiveStoreCategorySlugs();
    const active = new Set(slugs.map((s) => s.toLowerCase()));
    return MARKETPLACE_VERTICALS
      .filter((v) => v.storeCategories.some((c) => active.has(c)))
      .map((v) => v.id);
  },

  /**
   * Tiendas destacadas con PREVIEW de catálogo para el showcase de la home.
   *
   * Devuelve hasta `limit` tiendas publicadas con: banner, logo, rating,
   * categoría/zona, conteo de productos y hasta 4 productos (imagen + nombre +
   * precio) como "vistazo de lo que ofrecen". Ordena para que el showcase luzca:
   *   1) tiendas con preview real (productos con imagen) primero,
   *   2) luego las destacadas por el superadmin (benefits.featuredHome),
   *   3) luego por rating + reseñas.
   * Una tienda sin productos/imagen NO encabeza el showcase (no se puede
   * mostrar un catálogo vacío) — cae al rail "Recomendadas".
   *
   * Cache: 10 min revalidate, 2 min stale, 30 min expire.
   * @cross-tenant intentional (ADR-082) — agrega tiendas de todos los tenants.
   */
  async getFeaturedStoresWithPreview(limit: number = 3): Promise<FeaturedStorePreview[]> {
    "use cache";
    cacheLife({ revalidate: 600, stale: 120, expire: 1800 });
    cacheTag("marketplace-top-stores");
    try {

      const stores = await prisma.store.findMany({
        where: { isPublished: true },
        select: {
          id: true, slug: true, name: true, logo: true, banner: true,
          category: true, zone: true, rating: true, reviewCount: true,
          _count: { select: { products: { where: { isActive: true } } } },
          products: {
            where: {
              isActive: true,
              // Product.image es String (no-null en schema); en SQL `<> ''`
              // descarta tanto cadenas vacías como NULL (drift). Solo productos
              // con foto entran al preview.
              product: { active: true, deletedAt: null, image: { not: "" } },
            },
            orderBy: { id: "asc" },
            take: 4,
            select: {
              id: true,
              retailPrice: true,
              product: { select: { name: true, image: true } },
            },
          },
        },
        orderBy: [{ rating: "desc" }, { reviewCount: "desc" }],
        take: 12,
      });

      // 2026-05-31: visibilidad = SOLO isPublished (la query ya filtra
      // isPublished:true). Removido el blocklist de slugs/nombres test/demo:
      // para sacar una tienda del showcase, el superadmin la despublica
      // (criterio único, consistente con sitemap, API y SSR).
      const visibleStores = stores;

      // featuredHome: beneficio "Destacar en Home" (jsonb fuera del schema).
      let featuredIds = new Set<string>();
      try {
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM "Store" WHERE "isPublished"=true AND COALESCE((benefits->>'featuredHome')::boolean, false)=true`,
        );
        featuredIds = new Set(rows.map((r) => r.id));
      } catch { /* sin columna benefits → ninguna destacada */ }

      const mapped: FeaturedStorePreview[] = visibleStores.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        logo: s.logo,
        banner: s.banner,
        category: s.category,
        zone: s.zone,
        rating: toNumOrZero(s.rating),
        reviewCount: s.reviewCount,
        featuredHome: featuredIds.has(s.id),
        productCount: s._count.products,
        preview: s.products
          .filter((sp) => sp.product.image)
          .map((sp) => ({
            id: sp.id,
            name: sp.product.name,
            image: sp.product.image as string,
            price: Number(sp.retailPrice),
          })),
      }));

      // Showcase primero las que SÍ tienen catálogo visible; luego destacadas;
      // luego rating. Una tienda vacía no encabeza (caería al rail).
      mapped.sort((a, b) => {
        const aHas = a.preview.length > 0 ? 1 : 0;
        const bHas = b.preview.length > 0 ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;
        if (a.featuredHome !== b.featuredHome) return a.featuredHome ? -1 : 1;
        return b.rating - a.rating || b.reviewCount - a.reviewCount;
      });

      return mapped.slice(0, limit);
    } catch (err: unknown) {
      // No tragamos el error en silencio: un fallo real de DB (timeout, pool)
      // se loguea para distinguirlo de "no hay tiendas" (audit code-review).
      logger.warn("[marketplace] getFeaturedStoresWithPreview failed", { error: String(err) });
      return [];
    }
  },

  /**
   * Reviews publicas aprobadas con rating alto (4+) para social proof.
   * Cache: 10 min revalidate, 2 min stale, 30 min expire.
   */
  async getMarketplaceReviews(limit: number = 6): Promise<
    Array<{ id: string; name: string; text: string; rating: number; date: Date }>
  > {
    "use cache";
    cacheLife({ revalidate: 600, stale: 120, expire: 1800 });
    cacheTag("marketplace-reviews");
    try {
       
      return await prisma.review.findMany({
        where: { status: "approved", rating: { gte: 4 }, storeId: { not: null } },
        orderBy: { date: "desc" },
        take: limit,
        select: { id: true, name: true, text: true, rating: true, date: true },
      });
    } catch {
      return [];
    }
  },
};

// Alias para facilitar log en caso de error en callers
export const _marketplacePublicDbLogger = logger;
