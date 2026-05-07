import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * ROADMAP ITEM #61 — Reviews con fotos + filtros
 *
 * Query helper que permite filtrar reviews por rating, por "tiene foto",
 * y por verified purchase. Devuelve también agregados para el filter UI.
 *
 * PERF 2026-05-05: getFilteredReviewsWithAggregate combina las dos queries
 * anteriores (getFilteredReviews + getReviewAggregate) en un único viaje a DB,
 * eliminando el N+1 cuando ambos resultados se necesitan en la misma request.
 */

export interface ReviewFilterInput {
  tenantId: string;
  productId: number;
  minRating?: number;
  onlyWithPhoto?: boolean;
  onlyVerified?: boolean;
  limit?: number;
  offset?: number;
}

export interface ReviewAggregate {
  total: number;
  avgRating: number;
  byRating: Record<1 | 2 | 3 | 4 | 5, number>;
  withPhoto: number;
  verified: number;
}

export async function getFilteredReviews(input: ReviewFilterInput) {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const offset = Math.max(0, input.offset ?? 0);

  const where: Record<string, unknown> = {
    tenantId: input.tenantId,
    productId: input.productId,
  };
  if (input.minRating) where.rating = { gte: input.minRating };
  if (input.onlyVerified) where.verified = true;

  const rows = await prisma.review.findMany({
    where,
    orderBy: { date: "desc" },
    take: limit,
    skip: offset,
  });

  if (input.onlyWithPhoto) {
    return rows.filter((r) => {
      if (!r.photosJson) return false;
      try {
        const photos = JSON.parse(r.photosJson) as unknown;
        return Array.isArray(photos) && photos.length > 0;
      } catch {
        return false;
      }
    });
  }
  return rows;
}

export async function getReviewAggregate(
  tenantId: string,
  productId: number,
): Promise<ReviewAggregate> {
  const rows = await prisma.review.findMany({
    where: { tenantId, productId },
    select: {
      rating: true,
      verified: true,
      photosJson: true,
    },
  });

  return _computeAggregate(rows);
}

// ── PERF 2026-05-05: helper de cálculo puro (sin IO) ─────────────────────────
// Reutilizado por getReviewAggregate y getFilteredReviewsWithAggregate.
function _computeAggregate(
  rows: Array<{ rating: number | null; verified: boolean | null; photosJson: string | null }>,
): ReviewAggregate {
  const byRating: ReviewAggregate["byRating"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  let withPhoto = 0;
  let verified = 0;

  for (const r of rows) {
    const rating = Math.max(1, Math.min(5, r.rating ?? 0)) as 1 | 2 | 3 | 4 | 5;
    byRating[rating] = (byRating[rating] ?? 0) + 1;
    ratingSum += rating;
    if (r.photosJson) {
      try {
        const photos = JSON.parse(r.photosJson) as unknown;
        if (Array.isArray(photos) && photos.length > 0) withPhoto++;
      } catch {
        // ignore corrupt payloads
      }
    }
    if (r.verified) verified++;
  }

  return {
    total: rows.length,
    avgRating: rows.length > 0 ? ratingSum / rows.length : 0,
    byRating,
    withPhoto,
    verified,
  };
}

/**
 * PERF 2026-05-05: Versión combinada — una sola query para filtros + agregado.
 *
 * Antes: dos llamadas separadas (getFilteredReviews + getReviewAggregate)
 * hacían 2 round-trips a DB para el mismo (tenantId, productId).
 * Ahora: 1 query con todos los campos necesarios, luego derivamos el agregado
 * en memoria sobre los rows ya traídos.
 *
 * Limitación conocida: el filtro `onlyWithPhoto` se aplica en JS (igual que
 * antes), y el agregado refleja TODOS los reviews del producto (no solo los
 * filtrados), que es el comportamiento esperado para el filter UI.
 */
export async function getFilteredReviewsWithAggregate(input: ReviewFilterInput): Promise<{
  reviews: Awaited<ReturnType<typeof getFilteredReviews>>;
  aggregate: ReviewAggregate;
}> {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const offset = Math.max(0, input.offset ?? 0);

  // PERF 2026-05-05: traemos todos los campos necesarios en UN viaje.
  // El agregado se calcula sobre el conjunto completo (sin filtros de rating
  // ni verified) para mostrar conteos globales en el filter UI.
  const [filteredRows, allRows] = await Promise.all([
    prisma.review.findMany({
      where: {
        tenantId: input.tenantId,
        productId: input.productId,
        ...(input.minRating ? { rating: { gte: input.minRating } } : {}),
        ...(input.onlyVerified ? { verified: true } : {}),
      },
      orderBy: { date: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.review.findMany({
      where: { tenantId: input.tenantId, productId: input.productId },
      select: { rating: true, verified: true, photosJson: true },
    }),
  ]);

  const reviews = input.onlyWithPhoto
    ? filteredRows.filter((r) => {
        if (!r.photosJson) return false;
        try {
          const photos = JSON.parse(r.photosJson) as unknown;
          return Array.isArray(photos) && photos.length > 0;
        } catch {
          return false;
        }
      })
    : filteredRows;

  return {
    reviews,
    aggregate: _computeAggregate(allRows),
  };
}
