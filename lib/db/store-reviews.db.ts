import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * StoreReviewsDB — lee reseñas REALES de la tabla `Review` filtradas
 * por storeId. Reemplaza el mock `MOCK_STORE_REVIEWS` que estaba en
 * `lib/mock-store-reviews.ts`.
 *
 * Reglas:
 *   - Solo `status="approved"` y `deletedAt IS NULL`.
 *   - Top 50 más recientes (suficiente para la página de detalle).
 *   - Defensive: si la query falla por schema drift u otro motivo,
 *     devuelve listas vacías (la UI muestra empty state honesto).
 */

export interface StoreReview {
  id: string;
  authorName: string;
  authorInitials: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified: boolean;
  helpfulCount: number;
}

export interface StoreRatingSummary {
  average: number;
  total: number;
  breakdown: Array<{ stars: number; count: number; percentage: number }>;
}

const EMPTY_SUMMARY: StoreRatingSummary = {
  average: 0,
  total: 0,
  breakdown: [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: 0, percentage: 0 })),
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function buildSummary(reviews: Array<{ rating: number }>): StoreRatingSummary {
  if (reviews.length === 0) return EMPTY_SUMMARY;
  const total = reviews.length;
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  const average = sum / total;
  const counts = new Map<number, number>([[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]);
  for (const r of reviews) {
    const k = Math.max(1, Math.min(5, Math.round(r.rating)));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const breakdown = [5, 4, 3, 2, 1].map((stars) => {
    const count = counts.get(stars) ?? 0;
    return { stars, count, percentage: Math.round((count / total) * 100) };
  });
  return { average: Math.round(average * 10) / 10, total, breakdown };
}

function buildSummaryFromGroups(
  groups: Array<{ rating: number; _count: { rating: number } }>,
): StoreRatingSummary {
  if (groups.length === 0) return EMPTY_SUMMARY;
  let total = 0;
  let sum = 0;
  const counts = new Map<number, number>([[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]);
  for (const g of groups) {
    const k = Math.max(1, Math.min(5, Math.round(g.rating)));
    const c = g._count.rating;
    counts.set(k, (counts.get(k) ?? 0) + c);
    total += c;
    sum += g.rating * c;
  }
  if (total === 0) return EMPTY_SUMMARY;
  const average = sum / total;
  const breakdown = [5, 4, 3, 2, 1].map((stars) => {
    const count = counts.get(stars) ?? 0;
    return { stars, count, percentage: Math.round((count / total) * 100) };
  });
  return { average: Math.round(average * 10) / 10, total, breakdown };
}

export const StoreReviewsDB = {
  /** Lee reseñas reales para una tienda marketplace. */
  async listByStoreId(tenantId: string, storeId: string, limit = 50): Promise<{
    reviews: StoreReview[];
    summary: StoreRatingSummary;
  }> {
    try {
      // Paralelizar: top-N reviews + groupBy de ratings para summary.
      // Antes: 2 queries seriales (~2× latencia + traía todos los rows).
      // Ahora: 2 queries paralelas, summary via groupBy (DB-side).
      const baseWhere = { tenantId, storeId, status: "approved", deletedAt: null };
      const [rows, ratingGroups] = await Promise.all([
        prisma.review.findMany({
          where: baseWhere,
          orderBy: { date: "desc" },
          take: limit,
          select: {
            id: true,
            name: true,
            location: true,
            text: true,
            rating: true,
            date: true,
          },
        }),
        prisma.review.groupBy({
          by: ["rating"],
          where: baseWhere,
          _count: { rating: true },
        }),
      ]);

      const reviews: StoreReview[] = rows.map((r) => {
        const text = r.text ?? "";
        // Si el texto tiene un título (primera línea corta), extraerlo.
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const title = lines.length > 1 && lines[0]!.length <= 80 ? lines[0]! : "";
        const body = title ? lines.slice(1).join(" ") : text;
        return {
          id: r.id,
          authorName: r.name || "Cliente",
          authorInitials: getInitials(r.name || "Cliente"),
          rating: r.rating,
          title: title || (r.location ? `Cliente de ${r.location}` : "Reseña"),
          body: body || text,
          date: r.date.toISOString(),
          verified: true, // si llegó del DB y status=approved, lo consideramos verificado
          helpfulCount: 0,
        };
      });

      // Summary desde groupBy (más eficiente que traer todos los rows).
      const summary = buildSummaryFromGroups(ratingGroups);

      return { reviews, summary };
    } catch (err) {
      logger.warn("[store-reviews] read failed — returning empty", { storeId, error: String(err).slice(0, 200) });
      return { reviews: [], summary: EMPTY_SUMMARY };
    }
  },

  /**
   * Agregado REAL de reseñas (avg + count) por storeId, leído de la tabla
   * Review (status approved, no borradas). Audit SEO 2026-05-31: el JSON-LD
   * aggregateRating debe basarse en reseñas REALES, NO en la columna sembrada
   * Store.rating/reviewCount (que en lanzamiento puede tener data semilla sin
   * filas Review detrás → "spammy structured markup" para Google). Un solo
   * groupBy para N tiendas. Devuelve Map vacío ante cualquier fallo (el caller
   * simplemente no emite aggregateRating = comportamiento honesto).
   */
  async getApprovedAggregatesByStoreIds(
    storeIds: string[],
  ): Promise<Map<string, { average: number; total: number }>> {
    const map = new Map<string, { average: number; total: number }>();
    const ids = storeIds.filter(Boolean);
    if (ids.length === 0) return map;
    try {
      const groups = await prisma.review.groupBy({
        by: ["storeId"],
        where: { storeId: { in: ids }, status: "approved", deletedAt: null },
        _avg: { rating: true },
        _count: { rating: true },
      });
      for (const g of groups) {
        if (!g.storeId) continue;
        const total = g._count.rating ?? 0;
        if (total <= 0) continue;
        map.set(g.storeId, {
          average: Math.round((g._avg.rating ?? 0) * 10) / 10,
          total,
        });
      }
      return map;
    } catch (err) {
      logger.warn("[store-reviews] getApprovedAggregatesByStoreIds failed", {
        error: String(err).slice(0, 200),
      });
      return map;
    }
  },

  /** Azúcar para una sola tienda. Devuelve null si no hay reseñas reales. */
  async getApprovedAggregate(
    storeId: string,
  ): Promise<{ average: number; total: number } | null> {
    const map = await this.getApprovedAggregatesByStoreIds([storeId]);
    return map.get(storeId) ?? null;
  },

  /**
   * Re-materializa Store.rating + Store.reviewCount desde las reviews APROBADAS
   * de la tienda. Llamar tras moderar una review: el storefront recalcula el
   * rating en vivo (listByStoreId), pero las CARDS del directorio y el SEO
   * (metadata + JSON-LD aggregateRating) leen el campo materializado Store.rating
   * — que quedaba stale. Defensivo: si falla, loguea y sigue (no rompe la
   * moderación). Scoped por tenantId. Brandon 2026-05-30 (audit #8).
   */
  async recalcStoreRating(tenantId: string, storeId: string): Promise<void> {
    try {
      const agg = await prisma.review.aggregate({
        where: { tenantId, storeId, status: "approved", deletedAt: null },
        _avg: { rating: true },
        _count: { rating: true },
      });
      const avg = agg._avg.rating ?? 0;
      const count = agg._count.rating ?? 0;
      await prisma.store.updateMany({
        where: { id: storeId, tenantId },
        data: { rating: Math.round(avg * 10) / 10, reviewCount: count },
      });
    } catch (err) {
      logger.warn("[store-reviews] recalcStoreRating failed", {
        storeId,
        error: String(err).slice(0, 200),
      });
    }
  },
};
