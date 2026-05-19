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

};
