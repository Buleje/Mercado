/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 * Migrar a `lib/db/marketplace-*.db.ts` cuando se cree clase específica.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { applyBoostsToProducts } from "@/lib/marketplace/sponsored-ranker";
import { applyRateLimit } from "@/lib/rate-limit";


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
  // F4: storeSlug para filtrar catálogo por tienda específica
  storeSlug: z.string().optional(),
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
  // SECURITY 2026-05-06 (audit storefront LOW): rate limit GENEROUS para
  // proteger contra scraping abusivo del catálogo. La pestaña normal del
  // storefront pasa fácil; bots agresivos se frenan.
  const rl = applyRateLimit(req, "GENEROUS", "marketplace-catalog");
  if (rl) return rl;

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

    const { q, category, storeSlug, zone, minPrice, maxPrice, sort, cursor, limit } =
      parsed.data;

    logger.info("marketplace/catalog", {
      requestId,
      q,
      category,
      zone,
      sort,
      limit,
    });

    // cross-tenant OK — enriquecimiento usa tenantId solo para imágenes/variantes del tenant que sirve el catálogo
    const tenantId = req.headers.get("x-tenant-id") ?? "main";

    const results = await MarketplacePublicDB.getCatalogPage({
      q,
      category,
      storeSlug,
      zone,
      minPrice,
      maxPrice,
      sort,
      cursor,
      limit,
    });

    const hasMore = results.length > limit;
    const items = results.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    const productIds = items.map((r) => r.product.id);
    const { primaryImageMap, variantMap, ratingMap, bestSellerIds } =
      await MarketplacePublicDB.batchCatalogEnrichment(productIds, tenantId);

    // ID threshold para badge "new": los IDs más altos son los más recientes
    const maxId = productIds.length > 0 ? Math.max(...productIds) : 0;
    const newThreshold = maxId * 0.9; // top 10% de IDs recientes = "new"

    const data = items.map((r) => {
      const pid = r.product.id;
      const stock = r.product.stock ?? 0;

      const badges: string[] = [];
      if (pid >= newThreshold && newThreshold > 0) badges.push("new");
      if (stock > 0 && stock < 5) badges.push("low-stock");
      if (bestSellerIds.has(pid)) badges.push("best-seller");
      if (r.store.rating > 4.5) badges.push("verified");

      return {
        storeProductId: r.id,
        productId: pid,
        name: r.product.name,
        price: r.retailPrice,
        image: primaryImageMap.get(pid) ?? r.product.image,
        images: primaryImageMap.has(pid) ? [primaryImageMap.get(pid)!] : (r.product.image ? [r.product.image] : []),
        unit: r.product.unit,
        category: r.product.category,
        stock,
        hasVariants: (variantMap.get(pid) ?? 0) > 0,
        avgRating: Math.round((ratingMap.get(pid) ?? 0) * 10) / 10,
        badges,
        storeId: r.store.id,
        storeName: r.store.name,
        storeSlug: r.store.slug,
        storeLogo: r.store.logo,
        storeZone: r.store.zone,
        storeRating: r.store.rating,
        storeCategory: r.store.category,
      };
    });

    // Aplicar sponsored ranking (máx 3 por página al tope)
    const rankedData = await applyBoostsToProducts(tenantId, data);

    return NextResponse.json(
      {
        data: rankedData,
        total: rankedData.length,
        nextCursor,
        hasMore,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    logger.error("marketplace/catalog: error", { requestId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
