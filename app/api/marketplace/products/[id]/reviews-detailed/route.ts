import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const PostSchema = z.object({
  text: z.string().min(1).max(2000),
  rating: z.int().min(1).max(5),
  qualityRating: z.int().min(1).max(5).optional(),
  priceRating: z.int().min(1).max(5).optional(),
  deliveryRating: z.int().min(1).max(5).optional(),
  photosJson: z.string().optional(),
  customerPhone: z.string().min(1),
  customerName: z.string().min(1).max(100),
});

type RouteParams = { params: Promise<{ id: string }> };

async function computeSummary(productId: number, tenantId: string) {
  const [agg, distribution] = await Promise.all([
    prisma.review.aggregate({
      where: { productId, tenantId, status: "approved", deletedAt: null },
      _avg: { rating: true, qualityRating: true, priceRating: true, deliveryRating: true },
      _count: { rating: true },
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where: { productId, tenantId, status: "approved", deletedAt: null },
      _count: { rating: true },
    }),
  ]);

  const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of distribution) {
    ratingDist[row.rating] = row._count.rating;
  }

  return {
    avgRating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
    avgQuality: Math.round((agg._avg.qualityRating ?? 0) * 10) / 10,
    avgPrice: Math.round((agg._avg.priceRating ?? 0) * 10) / 10,
    avgDelivery: Math.round((agg._avg.deliveryRating ?? 0) * 10) / 10,
    totalReviews: agg._count.rating,
    ratingDistribution: ratingDist,
  };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const traceId = newTraceId();
  try {
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "ID de producto inválido" }, { status: 400 });
    }

    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: "Parámetros inválidos", issues: parsed.error.issues }, { status: 400 });
    }

    const { cursor, limit } = parsed.data;
    const summaryKey = `marketplace:product:${productId}:reviews-summary:${tenantId}`;

    const [reviews, summary] = await Promise.all([
      prisma.review.findMany({
        where: { productId, tenantId, status: "approved", deletedAt: null },
        select: {
          id: true,
          name: true,
          text: true,
          rating: true,
          qualityRating: true,
          priceRating: true,
          deliveryRating: true,
          photosJson: true,
          verified: true,
          helpfulCount: true,
          adminReply: true,
          adminReplyDate: true,
          date: true,
        },
        orderBy: { date: "desc" },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      }),
      getOrSet(summaryKey, 120, () => computeSummary(productId, tenantId)),
    ]);

    const hasMore = reviews.length > limit;
    const items = reviews.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    const data = items.map((r) => ({
      ...r,
      adminReplyDate: r.adminReplyDate?.toISOString() ?? null,
      date: r.date.toISOString(),
    }));

    return NextResponse.json({ data, summary, hasMore, nextCursor });
  } catch (err) {
    logger.error("marketplace/products/reviews-detailed GET: error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const traceId = newTraceId();
  try {
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "ID de producto inválido" }, { status: 400 });
    }

    const tenantId = req.headers.get("x-tenant-id") ?? "main";

    const body = await req.json();
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
    }

    const { customerPhone, customerName, ...reviewFields } = parsed.data;

    // Verificar si el cliente tiene una orden con este producto
    const existingOrder = await prisma.order.findFirst({
      where: {
        tenantId,
        customerPhone,
        deletedAt: null,
        items: { some: { productId } },
      },
      select: { id: true },
    });
    const verified = !!existingOrder;

    const review = await prisma.review.create({
      data: {
        id: crypto.randomUUID(),
        name: customerName,
        text: reviewFields.text,
        rating: reviewFields.rating,
        qualityRating: reviewFields.qualityRating ?? null,
        priceRating: reviewFields.priceRating ?? null,
        deliveryRating: reviewFields.deliveryRating ?? null,
        photosJson: reviewFields.photosJson ?? null,
        productId,
        tenantId,
        phone: customerPhone,
        status: "pending",
        verified,
        date: new Date(),
      },
      select: {
        id: true, name: true, text: true, rating: true,
        qualityRating: true, priceRating: true, deliveryRating: true,
        verified: true, status: true, date: true,
      },
    });

    invalidateByPrefix(`marketplace:product:${productId}:reviews`);

    return NextResponse.json({ data: { ...review, date: review.date.toISOString() } }, { status: 201 });
  } catch (err) {
    logger.error("marketplace/products/reviews-detailed POST: error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
