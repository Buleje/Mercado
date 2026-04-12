import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * ROADMAP ITEM #61 — Reviews con fotos + filtros
 *
 * Query helper que permite filtrar reviews por rating, por "tiene foto",
 * y por verified purchase. Devuelve también agregados para el filter UI.
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
