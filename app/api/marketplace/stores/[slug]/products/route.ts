export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId, NotFoundError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  category: z.string().optional(),
  search:   z.string().optional(),
  sort:     z.enum(["price_asc", "price_desc"]).optional(),
  limit:    z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const traceId = newTraceId();
  try {
    const { slug } = await params;

    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { category, search, sort, limit } = parsed.data;

    // Verificar que la tienda exista y esté publicada
    const store = await prisma.store.findUnique({
      where: { slug },
      select: { id: true, isPublished: true },
    });
    if (!store || !store.isPublished) {
      throw new NotFoundError("Tienda");
    }

    const orderBy = sort === "price_desc"
      ? { retailPrice: "desc" as const }
      : { retailPrice: "asc" as const };

    // Merge category + search into one Product filter object — spreading two
    // separate `{ Product: ... }` keys causes the second to silently overwrite the first.
    const productFilter = {
      ...(category && { category }),
      ...(search   && { name: { contains: search, mode: "insensitive" as const } }),
    };

    const raw = await prisma.storeProduct.findMany({
      where: {
        storeId:  store.id,
        isActive: true,
        ...(Object.keys(productFilter).length > 0 && { Product: productFilter }),
      },
      select: {
        id:          true,
        retailPrice: true,
        minOrderQty: true,
        Product: {
          select: {
            id:       true,
            name:     true,
            image:    true,
            category: true,
            unit:     true,
            stock:    true,
          },
        },
      },
      orderBy,
      take: limit,
    });

    const products = raw.map((sp) => ({
      id:             sp.Product.id,
      storeProductId: sp.id,
      name:           sp.Product.name,
      price:          sp.retailPrice,
      minOrderQty:    sp.minOrderQty,
      image:          sp.Product.image,
      category:       sp.Product.category,
      unit:           sp.Product.unit,
      stock:          sp.Product.stock ?? 0,
    }));

    logger.info("[marketplace/products] GET", { traceId, slug, count: products.length });
    return NextResponse.json({ data: products, total: products.length });
  } catch (err) {
    logger.error("[marketplace/products] GET error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
