import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * MarketplaceProductsDB
 *
 * Lookups cross-store de productos del marketplace. Útil para:
 *   - Hidratar carritos multi-tenant (check-exists)
 *   - Resolver tenant owner de un product global (recommendations)
 *
 * Audit project-wide 2026-05-19 (CodeReview P0 #1): migración de los
 * `prisma.product.*` directos en endpoints públicos del marketplace.
 *
 * @cross-tenant intentional — endpoint público marketplace.
 * Solo retorna `id` y `tenantId`, nunca datos sensibles. Aplica filtros
 * `active: true, deletedAt: null` por defensa.
 */

export const MarketplaceProductsDB = {
  /**
   * Filtra una lista de productIds y devuelve cuáles existen y están
   * activos. Opcional: filtrar por un tenantId específico (modo storefront
   * tenant-scoped). Sin tenantId → cross-store (marketplace global).
   *
   * Lista de entrada capped a 100 — el caller debe validar antes.
   */
  async findExistingIds(
    ids: number[],
    opts: { tenantId?: string } = {},
  ): Promise<number[]> {
    if (ids.length === 0) return [];
    // El caller decide soft-fail (cache header diferente en error) —
    // propagamos el error en lugar de comernos cualquier excepcion aqui.
    const rows = await prisma.product.findMany({
      where: {
        id: { in: ids },
        active: true,
        deletedAt: null,
        ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  },

  /**
   * Devuelve el tenantId dueño de un product global. Útil cuando el
   * productId viene del path pero el tenantId no es confiable (header
   * spoofable). Defense-in-depth para endpoints públicos.
   */
  async getTenantById(productId: number): Promise<string | null> {
    try {
      const row = await prisma.product.findFirst({
        where: { id: productId, deletedAt: null },
        select: { tenantId: true },
      });
      return row?.tenantId ?? null;
    } catch (err) {
      logger.warn("[MarketplaceProductsDB.getTenantById] DB error", {
        productId,
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  },

  /**
   * Resuelve un tenantSlug o tenantId a su CUID canónico. Útil cuando
   * llega un identificador ambiguo desde el frontend.
   */
  async resolveTenantId(slugOrId: string): Promise<string | null> {
    try {
      const row = await prisma.tenant.findFirst({
        where: { OR: [{ id: slugOrId }, { slug: slugOrId }] },
        select: { id: true },
      });
      return row?.id ?? null;
    } catch (err) {
      logger.warn("[MarketplaceProductsDB.resolveTenantId] DB error", {
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  },

  /**
   * Asserts that productId pertenece al tenant. Devuelve true/false.
   * Usado como guard cross-tenant en endpoints admin (images, badges, etc).
   * Filtra deletedAt para no aceptar productos soft-deleted como validos.
   */
  async assertOwnership(tenantId: string, productId: number): Promise<boolean> {
    const row = await prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      select: { id: true },
    });
    return !!row;
  },

  /**
   * Lee los meta SEO de un producto (scope tenant). Util para el editor
   * de SEO en admin y el render de meta tags en /producto/[id].
   */
  async getSeoMeta(
    tenantId: string,
    productId: number,
  ): Promise<{
    metaTitle: string | null;
    metaDescription: string | null;
    metaKeywordsJson: string | null;
    ogImage: string | null;
  } | null> {
    return prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      select: {
        metaTitle: true,
        metaDescription: true,
        metaKeywordsJson: true,
        ogImage: true,
      },
    });
  },

  /**
   * Actualiza meta SEO con scope tenant. Devuelve true si actualizo,
   * false si no se encontro (404). Usa updateMany para que el where
   * filtre tenant + deletedAt en una sola query.
   */
  async updateSeoMeta(
    tenantId: string,
    productId: number,
    data: {
      metaTitle?: string;
      metaDescription?: string;
      metaKeywordsJson?: string;
      ogImage?: string;
    },
  ): Promise<boolean> {
    const result = await prisma.product.updateMany({
      where: { id: productId, tenantId, deletedAt: null },
      data,
    });
    return result.count > 0;
  },
  /**
   * Catalogo cross-store para resolucion de ingredientes de recetas.
   * Filtra solo tiendas publicadas + sin vacationMode + storeProducts activos.
   * Cap a 5000 rows para mantener fuzzy match en memoria razonable.
   *
   * Filtra rows con product=null o store?.slug=null en el helper (consumer
   * solo recibe rows con campos no nulos garantizados).
   *
   * @cross-tenant intentional — marketplace publico (ADR-082).
   */
  async getStoreProductsCatalog(opts: { take?: number } = {}): Promise<
    Array<{
      id: string;
      retailPrice: { toNumber(): number; toFixed(decimals?: number): string; toString(): string } | number | string;
      product: { id: number; name: string; image: string | null; category: string; unit: string; stock: number | null };
      store: { slug: string; name: string };
    }>
  > {
    const rows = await prisma.storeProduct.findMany({
      where: {
        isActive: true,
        store: { isPublished: true, vacationMode: { not: true } },
      },
      select: {
        id: true,
        retailPrice: true,
        product: {
          select: { id: true, name: true, image: true, category: true, unit: true, stock: true },
        },
        store: { select: { slug: true, name: true } },
      },
      take: opts.take ?? 5000,
    });
    // Filtro types-safe: product y store.slug deben existir.
    return rows.flatMap((r) =>
      r.product != null && r.store?.slug != null
        ? [{ id: r.id, retailPrice: r.retailPrice, product: r.product, store: { slug: r.store.slug, name: r.store.name } }]
        : [],
    );
  },

  /**
   * Bulk-edit de productos con scope de tenant (admin). Usa $transaction
   * para atomicidad. Devuelve count actualizados y failures con id+motivo.
   * Audit project-wide 2026-05-19 — migracion de marketplace/products/bulk-edit.
   */
  async bulkEdit(
    tenantId: string,
    updates: Array<{
      id: number;
      price?: number;
      active?: boolean;
      category?: string;
      stock?: number;
    }>,
  ): Promise<{ updated: number; failed: Array<{ id: number; error: string }> }> {
    const failed: Array<{ id: number; error: string }> = [];
    let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const item of updates) {
        const { id, ...data } = item;
        try {
          await tx.product.update({
            where: { id, tenantId, deletedAt: null },
            data,
          });
          updated++;
        } catch (err) {
          failed.push({ id, error: err instanceof Error ? err.message : "Error desconocido" });
        }
      }
    });
    return { updated, failed };
  },

  // ─── Badges helpers ───────────────────────────────────────────────────────

  /**
   * Devuelve la info necesaria para computar badges (stock, store rating
   * y zone, agregado de orderItem top-sellers, max productId del tenant
   * para badge "new"). Paralelo via Promise.all.
   * Audit project-wide 2026-05-19 — migracion de marketplace/products/[id]/badges.
   */
  async getBadgeData(
    tenantId: string,
    productId: number,
  ): Promise<{
    product: { id: number; stock: number | null } | null;
    storeRating: number | null;
    storeZone: string | null;
    topSellerIds: number[];
    maxProductId: number;
  }> {
    const sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const [product, storeProduct, topSellers, maxAgg] = await Promise.all([
      prisma.product.findFirst({
        where: { id: productId, tenantId, deletedAt: null },
        select: { id: true, stock: true },
      }),
      prisma.storeProduct.findFirst({
        where: { productId, isActive: true },
        select: { store: { select: { rating: true, zone: true } } },
      }),
      prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          order: {
            tenantId,
            deletedAt: null,
            createdAt: { gte: new Date(sinceMs) },
          },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),
      prisma.product.aggregate({
        where: { tenantId, deletedAt: null },
        _max: { id: true },
      }),
    ]);
    return {
      product,
      storeRating: storeProduct?.store?.rating ?? null,
      storeZone: storeProduct?.store?.zone ?? null,
      topSellerIds: topSellers
        .map((row) => row.productId)
        .filter((id): id is number => id != null),
      maxProductId: maxAgg._max.id ?? 0,
    };
  },

  // ─── Reviews helpers ──────────────────────────────────────────────────────

  /**
   * Agrega rating + ratingDistribution para un producto + tenant.
   * Solo reviews `status: approved` y `deletedAt: null`.
   */
  async getReviewsSummary(
    tenantId: string,
    productId: number,
  ): Promise<{
    avgRating: number;
    avgQuality: number;
    avgPrice: number;
    avgDelivery: number;
    totalReviews: number;
    ratingDistribution: Record<number, number>;
  }> {
    const [agg, distribution] = await Promise.all([
      prisma.review.aggregate({
        where: { productId, tenantId, status: "approved", deletedAt: null },
        _avg: { rating: true, qualityRating: true, priceRating: true, deliveryRating: true },
        _count: { rating: true },
      }),
      prisma.review.groupBy({
        by: ["rating"],
        where: { productId, tenantId, status: "approved", deletedAt: null },
        _count: { rating: true },
      }),
    ]);
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of distribution) dist[row.rating] = row._count.rating;
    return {
      avgRating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
      avgQuality: Math.round((agg._avg.qualityRating ?? 0) * 10) / 10,
      avgPrice: Math.round((agg._avg.priceRating ?? 0) * 10) / 10,
      avgDelivery: Math.round((agg._avg.deliveryRating ?? 0) * 10) / 10,
      totalReviews: agg._count.rating,
      ratingDistribution: dist,
    };
  },

  /**
   * Pagina las reviews aprobadas de un producto (cursor-based).
   */
  async getApprovedReviewsPage(
    tenantId: string,
    productId: number,
    opts: { cursor?: string; limit?: number } = {},
  ): Promise<
    Array<{
      id: string;
      name: string;
      text: string | null;
      rating: number;
      qualityRating: number | null;
      priceRating: number | null;
      deliveryRating: number | null;
      photosJson: string | null;
      verified: boolean;
      helpfulCount: number;
      adminReply: string | null;
      adminReplyDate: Date | null;
      date: Date;
    }>
  > {
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    return prisma.review.findMany({
      where: { productId, tenantId, status: "approved", deletedAt: null },
      select: {
        id: true,
        name: true,
        text: true,
        rating: true,
        qualityRating: true,
        priceRating: true,
        deliveryRating: true,
        photosJson: true,
        verified: true,
        helpfulCount: true,
        adminReply: true,
        adminReplyDate: true,
        date: true,
      },
      orderBy: { date: "desc" },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
  },

  /**
   * Verifica si el cliente (phone) tiene un pedido entregado o pendiente
   * que incluye el producto — usado para marcar review como "verified".
   */
  async customerHasPurchased(
    tenantId: string,
    customerPhone: string,
    productId: number,
  ): Promise<boolean> {
    const row = await prisma.order.findFirst({
      where: {
        tenantId,
        customerPhone,
        deletedAt: null,
        items: { some: { productId } },
      },
      select: { id: true },
    });
    return !!row;
  },

  /**
   * Crea una review en status="pending" (moderacion admin). Verified se
   * deriva de customerHasPurchased. Retorna los campos necesarios para
   * el render inmediato post-submit.
   */
  async createPendingReview(
    tenantId: string,
    data: {
      productId: number;
      customerPhone: string;
      customerName: string;
      text: string;
      rating: number;
      qualityRating?: number | null;
      priceRating?: number | null;
      deliveryRating?: number | null;
      photosJson?: string | null;
    },
  ): Promise<{
    id: string;
    name: string;
    text: string | null;
    rating: number;
    qualityRating: number | null;
    priceRating: number | null;
    deliveryRating: number | null;
    verified: boolean;
    status: string;
    date: Date;
  }> {
    const verified = await this.customerHasPurchased(tenantId, data.customerPhone, data.productId);
    return prisma.review.create({
      data: {
        id: crypto.randomUUID(),
        name: data.customerName,
        text: data.text,
        rating: data.rating,
        qualityRating: data.qualityRating ?? null,
        priceRating: data.priceRating ?? null,
        deliveryRating: data.deliveryRating ?? null,
        photosJson: data.photosJson ?? null,
        productId: data.productId,
        tenantId,
        phone: data.customerPhone,
        status: "pending",
        verified,
        date: new Date(),
      },
      select: {
        id: true, name: true, text: true, rating: true,
        qualityRating: true, priceRating: true, deliveryRating: true,
        verified: true, status: true, date: true,
      },
    });
  },

};
