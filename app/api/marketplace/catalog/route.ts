/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 * Migrar a `lib/db/marketplace-*.db.ts` cuando se cree clase específica.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { applyBoostsToProducts } from "@/lib/marketplace/sponsored-ranker";
import { applyRateLimit } from "@/lib/rate-limit";

// ── Batch helpers ─────────────────────────────────────────────────────────────

async function batchProductEnrichment(productIds: number[], tenantId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [primaryImages, variantCounts, ratingsAgg, topSellers] = await Promise.all([
    prisma.productImage.findMany({
      where: { productId: { in: productIds }, tenantId, isPrimary: true },
      select: { productId: true, url: true },
    }),
    prisma.productVariant.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, tenantId, isActive: true },
      _count: { id: true },
    }),
    prisma.review.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        tenantId,
        status: "approved",
        deletedAt: null,
      },
      _avg: { rating: true },
    }),
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        order: { tenantId, deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: Math.ceil(productIds.length * 0.1) || 1, // top 10%
    }),
  ]);

  const primaryImageMap = new Map(primaryImages.map((i) => [i.productId, i.url]));
  const variantMap = new Map(variantCounts.map((v) => [v.productId, v._count.id]));
  const ratingMap = new Map(ratingsAgg.map((r) => [r.productId, r._avg.rating ?? 0]));
  const bestSellerIds = new Set(topSellers.map((s) => s.productId));

  return { primaryImageMap, variantMap, ratingMap, bestSellerIds };
}

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
        // F4: filtrar por slug de tienda cuando se provee
        ...(storeSlug && { slug: storeSlug }),
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

    // SECURITY F1: rechazar si no hay tenant real (no aceptar "main" libre del cliente).
    const tenantId = req.headers.get("x-tenant-id") ?? "main"; // cross-tenant OK — enriquecimiento usa tenantId solo para imágenes/variantes del mismo tenant
    const productIds = items.map((r) => r.product.id);
    const { primaryImageMap, variantMap, ratingMap, bestSellerIds } =
      productIds.length > 0
        ? await batchProductEnrichment(productIds, tenantId)
        : { primaryImageMap: new Map(), variantMap: new Map(), ratingMap: new Map(), bestSellerIds: new Set<number>() };

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
