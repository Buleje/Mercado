// eslint-disable @typescript-eslint/no-restricted-imports
/* eslint-disable no-restricted-properties */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { isAllowedImageUrl } from "@/lib/url-allowlist";

/**
 * @prisma-direct excepción documentada — el endpoint POST hace `review.create`
 * + `store.update` con scope explícito (storeId resuelto via getBySlug que
 * ya filtra `isPublished:true`). Migrar a ReviewsMarketplaceDB.create cuando
 * esa clase soporte el incremento de rating de la tienda atómicamente.
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

    const reviews = await prisma.review.findMany({
      where: {
        storeId: store.id,
        deletedAt: null,
        status: "approved",
      },
      select: {
        id: true,
        name: true,
        rating: true,
        text: true,
        date: true,
        photosJson: true,
      },
      orderBy: { date: "desc" },
      take: 20,
    });

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

    // F1-a: verificar que la orden exista, pertenezca al cliente y esté entregada
    const verifiedOrder = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerPhone,
        status: { in: ["entregado", "confirmado"] },
        tenantId: store.tenantId,
      },
      select: { id: true },
    });
    if (!verifiedOrder) {
      return NextResponse.json(
        { error: "Solo clientes con compra entregada pueden reseñar" },
        { status: 403 },
      );
    }

    // F1-b: evitar múltiples reviews por la misma compra
    const existingByOrder = await prisma.review.findFirst({
      where: { orderId, phone: customerPhone, tenantId: store.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (existingByOrder) {
      return NextResponse.json(
        { error: "Ya reseñaste esta compra" },
        { status: 409 },
      );
    }

    // Crear la reseña
    const review = await prisma.review.create({
      data: {
        id: crypto.randomUUID(),
        name: reviewerName,
        text: comment,
        rating,
        phone: customerPhone,
        orderId,
        storeId: store.id,
        tenantId: store.tenantId,
        status: "approved",
        photosJson: imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
      },
    });

    // Recalcular rating y reviewCount de la tienda (server-side, sin depender del cliente)
    const newCount = store.reviewCount + 1;
    const newRating =
      Math.round(((store.rating * store.reviewCount + rating) / newCount) * 10) / 10;

    await prisma.store.update({
      where: { id: store.id },
      data: { rating: newRating, reviewCount: newCount },
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
        store: { rating: newRating, reviewCount: newCount },
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("[STORE-REVIEWS] POST error", { error: err });
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}
