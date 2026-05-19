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
};
