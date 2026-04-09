import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

// ── Schemas ─────────────────────────────────────────────────────────────────

const createReviewSchema = z.object({
  reviewerName: z.string().min(1).max(100),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(1).max(1000),
  customerPhone: z.string().max(20).optional(),
  imageUrls: z.array(z.string().url()).max(3).optional(),
});

// ── GET /api/marketplace/stores/[slug]/reviews — listar reseñas (público) ───

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const store = await prisma.store.findUnique({
      where: { slug },
      select: { id: true, isPublished: true },
    });

    if (!store || !store.isPublished) {
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
        // TECH-DEBT: campo imageUrls no está en schema Prisma, removido temporalmente
      },
      orderBy: { date: "desc" },
      take: 20,
    });

    return NextResponse.json({ data: reviews });
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
  try {
    const { slug } = await params;

    const store = await prisma.store.findUnique({
      where: { slug },
      select: { id: true, tenantId: true, isPublished: true, rating: true, reviewCount: true },
    });

    if (!store || !store.isPublished) {
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

    const { reviewerName, rating, comment, customerPhone, imageUrls } = parsed.data;

    // Una reseña por teléfono por tienda (si se proporciona phone)
    if (customerPhone) {
      const existing = await prisma.review.findFirst({
        where: { storeId: store.id, phone: customerPhone, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Ya has dejado una reseña para esta tienda" },
          { status: 409 },
        );
      }
    }

    // Crear la reseña
    const review = await prisma.review.create({
      data: {
        id: crypto.randomUUID(),
        name: reviewerName,
        text: comment,
        rating,
        phone: customerPhone ?? null,
        storeId: store.id,
        tenantId: store.tenantId,
        status: "approved",
        // TECH-DEBT: campo imageUrls no está en schema Prisma, removido temporalmente
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
          // TECH-DEBT: campo imageUrls no está en schema Prisma, removido temporalmente
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
