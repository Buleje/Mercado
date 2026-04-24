import "server-only";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";
import {
  MOCK_REVIEWS_LIBRARY,
  getMockReviewsForProduct,
  getReviewBreakdown,
  type MockReview,
} from "@/lib/mocks/product-reviews.mock";

/**
 * lib/db/product-reviews.db.ts — Reviews del marketplace (Ola 3).
 *
 * Esta capa es un contrato listo para mover a Prisma (ya existe
 * ReviewsMarketplaceDB en lib/db/reviews.db.ts), pero para que la feature
 * funcione end-to-end con data visual rica el backend devuelve mocks
 * determinísticos por productId. Cuando tengamos reviews reales con photos,
 * verified purchase, helpful votes, se reemplaza la implementación interna
 * sin cambiar la firma de los métodos.
 *
 * Convenciones:
 *   - `tenantId` primer param (aunque hoy los mocks no discriminan, la firma
 *     está lista para multi-tenant).
 *   - Cache getOrSet con TTL 120s.
 *   - `safeParse`/logger en la capa API; aquí devolvemos datos crudos.
 */

export type { MockReview } from "@/lib/mocks/product-reviews.mock";

export type ReviewSort = "recent" | "helpful" | "rating_high" | "rating_low";
export type ReviewFilter = "all" | "with_photos" | "verified" | "helpful";

export type ReviewListOptions = {
  filter?: ReviewFilter;
  sort?: ReviewSort;
  limit?: number;
  offset?: number;
};

export type ReviewsResult = {
  items: MockReview[];
  total: number;
  hasMore: boolean;
};

export const ProductReviewsDB = {
  /**
   * Lista reviews para un producto con filtros + sort + paginación.
   * Devuelve subset + total count para paginación.
   */
  async listForProduct(
    tenantId: string,
    productId: number,
    opts: ReviewListOptions = {},
  ): Promise<ReviewsResult> {
    const filter = opts.filter ?? "all";
    const sort = opts.sort ?? "recent";
    const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
    const offset = Math.max(opts.offset ?? 0, 0);

    const cacheKey = `product-reviews:${tenantId}:${productId}:${filter}:${sort}:${limit}:${offset}`;
    return getOrSet(cacheKey, 120, async () => {
      try {
        const all = getMockReviewsForProduct(productId);

        // Apply filter
        let filtered = all;
        if (filter === "with_photos") {
          filtered = all.filter((r) => r.photos.length > 0);
        } else if (filter === "verified") {
          filtered = all.filter((r) => r.verifiedPurchase);
        } else if (filter === "helpful") {
          filtered = all.filter((r) => r.helpfulCount >= 10);
        }

        // Apply sort
        const sorted = [...filtered];
        sorted.sort((a, b) => {
          if (sort === "recent") {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          if (sort === "helpful") {
            return b.helpfulCount - a.helpfulCount;
          }
          if (sort === "rating_high") {
            return b.rating - a.rating;
          }
          return a.rating - b.rating; // rating_low
        });

        const total = sorted.length;
        const items = sorted.slice(offset, offset + limit);
        const hasMore = offset + limit < total;

        return { items, total, hasMore };
      } catch (err) {
        logger.error("[ProductReviewsDB.listForProduct] failed", {
          err: String(err),
          productId,
        });
        return { items: [], total: 0, hasMore: false };
      }
    });
  },

  /**
   * Computa distribución de estrellas + promedio para un producto.
   * Usa el total completo (sin filtrar) para mostrar el panorama real.
   */
  async getBreakdown(tenantId: string, productId: number) {
    const cacheKey = `product-reviews-breakdown:${tenantId}:${productId}`;
    return getOrSet(cacheKey, 120, async () => {
      const all = getMockReviewsForProduct(productId);
      const base = getReviewBreakdown(all);
      const verifiedCount = all.filter((r) => r.verifiedPurchase).length;
      const withPhotos = all.filter((r) => r.photos.length > 0).length;
      return { ...base, verifiedCount, withPhotos };
    });
  },

  /**
   * Marca una review como útil. Hoy solo incrementa en memoria (mock),
   * pero la firma queda lista para persistir cuando migremos a Prisma.
   */
  async markHelpful(tenantId: string, reviewId: string): Promise<void> {
    // Noop seguro — la UI optimistamente incrementa y este método
    // simula el round-trip. En la migración real esto escribirá en DB.
    logger.info("[ProductReviewsDB.markHelpful] noop", { tenantId, reviewId });
  },
};

export { MOCK_REVIEWS_LIBRARY };
