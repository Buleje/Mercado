import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(5).max(20).default(10),
});

/**
 * GET /api/marketplace/bestsellers
 *
 * Top productos mas vendidos del marketplace (consumido por
 * MarketplaceBestsellersStrip en la home). Reusa getTopToday (ventana
 * 24h con fallback a 7d) y proyecta al shape de UnifiedProductCard:
 *   { items: [{ id(productId), storeProductId, productId, name, storeId,
 *               storeName, storeSlug, image, price, originalPrice, unit,
 *               category, stock, unitsSold }] }
 *
 * @cross-tenant intentional — agrega OrderItems de todos los tenants.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({ limit: searchParams.get("limit") ?? 10 });
    if (!parsed.success) {
      return NextResponse.json({ error: "limit invalido (5-20)", traceId }, { status: 400 });
    }

    const top = await MarketplacePublicDB.getTopToday(parsed.data.limit);

    const items = top.items.map((it) => ({
      // id = productId numérico (lo que espera UnifiedProductCard.product.id).
      id: it.productId,
      storeProductId: it.storeProductId,
      productId: it.productId,
      name: it.name,
      storeId: it.store.id,
      storeName: it.store.name,
      storeSlug: it.store.slug,
      storeLogo: it.store.logo,
      image: it.image,
      price: it.price,
      originalPrice: it.originalPrice,
      unit: it.unit,
      category: it.category,
      stock: it.stock,
      unitsSold: it.soldUnits,
    }));

    return NextResponse.json(
      { items, window: top.window, updatedAt: top.updatedAt },
      {
        headers: {
          "Cache-Control":
            "public, max-age=120, s-maxage=120, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    logger.error("[marketplace/bestsellers] failed", {
      error: err instanceof Error ? err.message : String(err),
      traceId,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
