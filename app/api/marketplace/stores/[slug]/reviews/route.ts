import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { MarketplaceReviewsDB } from "@/lib/db/marketplace/reviews.db";
import { toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { isAllowedImageUrl } from "@/lib/url-allowlist";

/**
 * Audit project-wide 2026-05-19: migrado a MarketplaceReviewsDB.
 * El POST usa addVerifiedStoreReview que encapsula el create + recompute
 * de rating/reviewCount del Store en una transaccion atomica.
 */

// ── Schemas ─────────────────────────────────────────────────────────────────

const createReviewSchema = z.object({
  reviewerName: z.string().min(1).max(100),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(1).max(1000),
  customerPhone: z.string().min(6).max(20),
  orderId: z.string().min(1),
  imageUrls: z
    .array(
      z.string().url().refine(isAllowedImageUrl, "URL de imagen no permitida (allowlist)"),
    )
    .max(3)
    .default([]),
});

// ── GET /api/marketplace/stores/[slug]/reviews — listar reseñas (público) ───

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const store = await MarketplaceStoresDB.getBySlug(slug);
    if (!store) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    const reviews = await MarketplaceReviewsDB.getByStore(store.id, { take: 20 });

    const data = reviews.map((r) => {
      let imageUrls: string[] = [];
      if (r.photosJson) {
        try {
          imageUrls = JSON.parse(r.photosJson) as string[];
        } catch {
          imageUrls = [];
        }
      }
      return {
        ...r,
        imageUrls,
        photosJson: undefined,
      };
    });

    return NextResponse.json({ data });
  } catch (err) {
    logger.error("[STORE-REVIEWS] GET error", { error: err });
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}

// ── POST /api/marketplace/stores/[slug]/reviews — crear reseña ───────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  // Audit P11 top-tier: rate limit anti-spam reviews (5 / 15min / IP)
  const rl = applyRateLimit(req, "STRICT", "marketplace-reviews-create");
  if (rl) return rl;

  try {
    const { slug } = await params;

    // getBySlug retorna id, tenantId, rating, reviewCount + filtra isPublished.
    const store = await MarketplaceStoresDB.getBySlug(slug);
    if (!store) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = createReviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { reviewerName, rating, comment, customerPhone, orderId, imageUrls } = parsed.data;

    // F1-a: verificar que la orden exista, pertenezca al cliente y este entregada
    const isValid = await MarketplaceReviewsDB.verifyOrderForReview(
      store.tenantId,
      orderId,
      customerPhone,
    );
    if (!isValid) {
      return NextResponse.json(
        { error: "Solo clientes con compra entregada pueden reseñar" },
        { status: 403 },
      );
    }

    // F1-b: evitar multiples reviews por la misma compra
    const alreadyReviewed = await MarketplaceReviewsDB.hasReviewForOrder(
      store.tenantId,
      orderId,
      customerPhone,
    );
    if (alreadyReviewed) {
      return NextResponse.json(
        { error: "Ya reseñaste esta compra" },
        { status: 409 },
      );
    }

    // Audit project-wide 2026-05-19: atomic create + store rating recompute.
    const { review, storeRating, storeReviewCount } =
      await MarketplaceReviewsDB.addVerifiedStoreReview({
        store: {
          id: store.id,
          tenantId: store.tenantId,
          rating: store.rating,
          reviewCount: store.reviewCount,
        },
        reviewerName,
        rating,
        comment,
        customerPhone,
        orderId,
        imageUrls,
      });

    logger.debug("[STORE-REVIEWS] Created", {
      storeId: store.id,
      reviewId: review.id,
      rating,
    });

    return NextResponse.json(
      {
        data: {
          id: review.id,
          name: review.name,
          rating: review.rating,
          text: review.text,
          date: review.date,
          imageUrls,
        },
        store: { rating: storeRating, reviewCount: storeReviewCount },
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("[STORE-REVIEWS] POST error", { error: err });
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}
