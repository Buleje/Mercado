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
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

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

// ── MarketplacePublicDB ───────────────────────────────────────────────────────

export const MarketplacePublicDB = {

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
      "marketplace:activity-feed:v1",
      60,
      async () => {
        const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const orders = await prisma.order.findMany({
          where: { createdAt: { gte: since } },
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
      monthStart: Date;
      prevMonthStart: Date;
      weekStart: Date;
    },
  ) {
    const { todayStart, monthStart, prevMonthStart, weekStart } = dates;

    return Promise.all([
      prisma.order.aggregate({
        where: { tenantId, source: "marketplace", deletedAt: null, createdAt: { gte: todayStart } },
        _count: true,
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { tenantId, source: "marketplace", deletedAt: null, createdAt: { gte: monthStart } },
        _count: true,
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { tenantId, source: "marketplace", deletedAt: null, createdAt: { gte: prevMonthStart, lt: monthStart } },
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
          order: { tenantId, source: "marketplace", deletedAt: null, createdAt: { gte: monthStart } },
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
          createdAt: { gte: weekStart },
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
        where: { tenantId, deletedAt: null, createdAt: { gte: monthStart } },
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
      };
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [primaryImages, variantCounts, ratingsAgg, topSellers] = await Promise.all([
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
    ]);

    return {
      primaryImageMap: new Map(primaryImages.map((i) => [i.productId, i.url])),
      variantMap: new Map(variantCounts.map((v) => [v.productId, v._count.id])),
      ratingMap: new Map(ratingsAgg.map((r) => [r.productId, r._avg.rating ?? 0])),
      bestSellerIds: new Set(topSellers.map((s) => s.productId)),
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
   * Catálogo unificado paginado con cursor.
   * @cross-tenant intentional (ADR-082) — agrega storeProducts de todos los stores publicados.
   */
  async getCatalogPage(opts: {
    q?: string;
    category?: string;
    storeSlug?: string;
    zone?: string;
    minPrice?: number;
    maxPrice?: number;
    sort: "popular" | "price_asc" | "price_desc" | "newest" | "rating";
    cursor?: string;
    limit: number;
  }) {
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

// Alias para facilitar log en caso de error en callers
export const _marketplacePublicDbLogger = logger;
