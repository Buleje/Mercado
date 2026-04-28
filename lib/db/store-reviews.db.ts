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

export const StoreReviewsDB = {
  /** Lee reseñas reales para una tienda marketplace. */
  async listByStoreId(storeId: string, limit = 50): Promise<{
    reviews: StoreReview[];
    summary: StoreRatingSummary;
  }> {
    try {
      const rows = await prisma.review.findMany({
        where: {
          storeId,
          status: "approved",
          deletedAt: null,
        },
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
      });

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

      // Para el summary contamos TODAS las reseñas approved, no solo las top 50.
      const allRatings = await prisma.review.findMany({
        where: { storeId, status: "approved", deletedAt: null },
        select: { rating: true },
      });
      const summary = buildSummary(allRatings);

      return { reviews, summary };
    } catch (err) {
      logger.warn("[store-reviews] read failed — returning empty", { storeId, error: String(err).slice(0, 200) });
      return { reviews: [], summary: EMPTY_SUMMARY };
    }
  },
};
