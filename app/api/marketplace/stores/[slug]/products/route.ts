export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId, NotFoundError } from "@/lib/api-error";

const QuerySchema = z.object({
  category: z.string().optional(),
  search:   z.string().optional(),
  sort:     z.enum(["price_asc", "price_desc"]).optional(),
  limit:    z.coerce.number().int().min(1).max(200).default(50),
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

    const orderBy = sort === "price_asc"
      ? { retailPrice: "asc" as const }
      : sort === "price_desc"
      ? { retailPrice: "desc" as const }
      : { retailPrice: "asc" as const };

    const raw = await prisma.storeProduct.findMany({
      where: {
        storeId:  store.id,
        isActive: true,
        ...(category && { Product: { category } }),
        ...(search   && { Product: { name: { contains: search, mode: "insensitive" } } }),
      },
      select: {
        id:            true,
        retailPrice:   true,
        wholesalePrice: true,
        minOrderQty:   true,
        isActive:      true,
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

    // Flatten para que el frontend reciba { id, name, price, stock, storeProductId, ... }
    const products = raw.map((sp) => ({
      id:             sp.Product.id,
      storeProductId: sp.id,
      name:           sp.Product.name,
      price:          sp.retailPrice,
      wholesalePrice: sp.wholesalePrice,
      minOrderQty:    sp.minOrderQty,
      image:          sp.Product.image,
      category:       sp.Product.category,
      unit:           sp.Product.unit,
      stock:          sp.Product.stock ?? 0,
    }));

    return NextResponse.json({ data: products, total: products.length });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
