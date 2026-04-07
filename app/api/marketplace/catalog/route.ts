export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/marketplace/catalog
 *
 * Catálogo unificado de TODOS los productos del marketplace.
 * Soporta filtros por categoría, precio, zona, ordenamiento y paginación con cursor.
 * Usado por el modo "Catálogo" (estilo Temu) del marketplace.
 */

const QuerySchema = z.object({
  q: z.string().max(100).optional(),
  category: z.string().optional(),
  zone: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z
    .enum(["popular", "price_asc", "price_desc", "newest", "rating"])
    .optional()
    .default("popular"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(40),
});

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  const requestId = req.headers.get("x-request-id") ?? traceId;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { q, category, zone, minPrice, maxPrice, sort, cursor, limit } =
      parsed.data;

    logger.info("marketplace/catalog", {
      requestId,
      q,
      category,
      zone,
      sort,
      limit,
    });

    const orderBy =
      sort === "price_desc"
        ? { retailPrice: "desc" as const }
        : sort === "price_asc"
          ? { retailPrice: "asc" as const }
          : sort === "newest"
            ? { id: "desc" as const }
            : sort === "rating"
              ? { store: { rating: "desc" as const } }
              : { store: { rating: "desc" as const } }; // popular = best rated stores first

    const where = {
      isActive: true,
      store: {
        isPublished: true,
        vacationMode: { not: true },
        ...(zone && { zone }),
      },
      ...(q && {
        product: {
          name: { contains: q, mode: "insensitive" as const },
        },
      }),
      ...(category &&
        category !== "todos" && {
          product: {
            ...((q && { name: { contains: q, mode: "insensitive" as const } }) || {}),
            category,
          },
        }),
      ...((minPrice !== undefined || maxPrice !== undefined) && {
        retailPrice: {
          ...(minPrice !== undefined && { gte: minPrice }),
          ...(maxPrice !== undefined && { lte: maxPrice }),
        },
      }),
    };

    const results = await prisma.storeProduct.findMany({
      where,
      select: {
        id: true,
        retailPrice: true,
        minOrderQty: true,
        product: {
          select: {
            id: true,
            name: true,
            image: true,
            category: true,
            unit: true,
            stock: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo: true,
            zone: true,
            rating: true,
            category: true,
          },
        },
      },
      orderBy,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = results.length > limit;
    const items = results.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    const data = items.map((r) => ({
      storeProductId: r.id,
      productId: r.product.id,
      name: r.product.name,
      price: r.retailPrice,
      image: r.product.image,
      unit: r.product.unit,
      category: r.product.category,
      stock: r.product.stock ?? 0,
      storeId: r.store.id,
      storeName: r.store.name,
      storeSlug: r.store.slug,
      storeLogo: r.store.logo,
      storeZone: r.store.zone,
      storeRating: r.store.rating,
      storeCategory: r.store.category,
    }));

    return NextResponse.json({
      data,
      total: data.length,
      nextCursor,
      hasMore,
    });
  } catch (err) {
    logger.error("marketplace/catalog: error", { requestId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
