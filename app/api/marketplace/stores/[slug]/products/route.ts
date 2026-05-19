import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { getOrSet } from "@/lib/cache";
import { toErrorPayload, newTraceId, NotFoundError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * @prisma-direct excepción documentada — `prisma.storeProduct.findMany`
 * accede a la junction table StoreProduct (cross-tenant intencional: el
 * marketplace público lista productos de cualquier tenant). El scope se
 * cierra por `storeId` que ya viene del store resuelto via
 * MarketplaceStoresDB.getBySlug (que filtra `isPublished:true`).
 */

const QuerySchema = z.object({
  category: z.string().optional(),
  search:   z.string().optional(),
  sort:     z.enum(["price_asc", "price_desc"]).optional(),
  limit:    z.coerce.number().int().min(1).max(200).default(50),
  cursor:   z.string().optional(),
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

    const { category, search, sort, limit, cursor } = parsed.data;
    const cacheKey = `marketplace:products:${slug}:${JSON.stringify({ category, search, sort, limit, cursor })}`;

    const result = await getOrSet(cacheKey, 60, async () => {
      // Verificar que la tienda exista y esté publicada (getBySlug ya filtra)
      const store = await MarketplaceStoresDB.getBySlug(slug);
      if (!store) {
        throw new NotFoundError("Tienda");
      }

      const sortDir = sort === "price_desc" ? "desc" as const : "asc" as const;

      // Merge category + search into one product filter object — spreading two
      // separate `{ product: ... }` keys causes the second to silently overwrite the first.
      // NOTA: la relación se llama `product` (camelCase) en prisma/schema.prisma
      // (StoreProduct.product). Antes este endpoint usaba `Product` con mayúscula
      // y devolvía 500 en runtime — bug oculto por ignoreBuildErrors: true.
      const productFilter = {
        ...(category && { category }),
        ...(search   && { name: { contains: search, mode: "insensitive" as const } }),
      };

      // eslint-disable-next-line no-restricted-properties -- query pública del marketplace, scoped por store.id que ya fue resuelto del slug. MarketplaceStoreProductsDB.list usa la misma forma, refactor pendiente.
      const raw = await prisma.storeProduct.findMany({
        where: {
          storeId:  store.id,
          isActive: true,
          ...(Object.keys(productFilter).length > 0 && { product: productFilter }),
        },
        select: {
          id:          true,
          retailPrice: true,
          minOrderQty: true,
          product: {
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
        // id as tiebreaker ensures stable cursor pagination across equal prices
        orderBy: [{ retailPrice: sortDir }, { id: "asc" }],
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      const hasMore = raw.length > limit;
      const items   = hasMore ? raw.slice(0, limit) : raw;
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      const products = items.map((sp) => ({
        id:             sp.product.id,
        storeProductId: sp.id,
        name:           sp.product.name,
        price:          sp.retailPrice,
        minOrderQty:    sp.minOrderQty,
        image:          sp.product.image,
        category:       sp.product.category,
        unit:           sp.product.unit,
        // null = no controla stock (restaurante/servicios) → cliente puede
        // agregar al carrito sin límite. 0 = agotado. NUNCA hacer ?? 0 acá:
        // colapsa la semántica y bloquea checkout de tiendas sin inventario.
        stock:          sp.product.stock,
      }));

      return { products, nextCursor };
    });

    logger.info("[marketplace/products] GET", { traceId, slug, count: result.products.length });
    return NextResponse.json({ data: result.products, total: result.products.length, nextCursor: result.nextCursor });
  } catch (err) {
    logger.error("[marketplace/products] GET error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
