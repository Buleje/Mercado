import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { MarketplaceStoresDB, MarketplaceStoreProductsDB } from "@/lib/db/marketplace.db";
import { getOrSet } from "@/lib/cache";
import { toErrorPayload, newTraceId, NotFoundError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * Audit project-wide 2026-05-19: migrado a MarketplaceStoreProductsDB.listForStorefront.
 * Encapsula la query cross-tenant (junction StoreProduct) con scope storeId
 * resuelto desde el slug por MarketplaceStoresDB.getBySlug (filtra
 * isPublished:true).
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

      // Audit project-wide 2026-05-19: migrado a MarketplaceStoreProductsDB.listForStorefront.
      // Encapsula la query findMany + map + cursor pagination.
      // stock: NUNCA hacer ?? 0 — colapsa null=sin-control (restaurantes)
      // con 0=agotado. La DB class preserva el null.
      const { products, nextCursor } = await MarketplaceStoreProductsDB.listForStorefront(
        store.id,
        { category, search, sort, limit, cursor },
      );

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
