import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { SearchSuggestionsDB } from "@/lib/db/search-suggestions.db";
import { applyBoostsToProducts } from "@/lib/marketplace/sponsored-ranker";
import { toNumOrZero } from "@/lib/decimal-utils";

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
      take: Math.ceil(productIds.length * 0.1) || 1,
    }),
  ]);

  const primaryImageMap = new Map(primaryImages.map((i) => [i.productId, i.url]));
  const variantMap = new Map(variantCounts.map((v) => [v.productId, v._count.id]));
  const ratingMap = new Map(ratingsAgg.map((r) => [r.productId, r._avg.rating ?? 0]));
  const bestSellerIds = new Set(topSellers.map((s) => s.productId));

  return { primaryImageMap, variantMap, ratingMap, bestSellerIds };
}

const QuerySchema = z.object({
  q:        z.string().min(1).max(100).transform((s) => s.replace(/[<>"'&]/g, "").trim()),
  zone:     z.string().optional(),
  category: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort:     z.enum(["price_asc", "price_desc", "name", "rating", "distance"]).optional(),
  lat:      z.coerce.number().optional(),
  lng:      z.coerce.number().optional(),
  radiusKm: z.coerce.number().min(0).max(100).optional(),
});

// Coordenadas aproximadas por zona (Pucallpa) — fallback para tiendas sin GPS exacto
const ZONE_COORDS: Record<string, [number, number]> = {
  centro:        [-8.3808, -74.5333],
  manantay:      [-8.4031, -74.5156],
  calleria:      [-8.37,   -74.55],
  yarinacocha:   [-8.2556, -74.5111],
  campo_verde:   [-8.3833, -74.4667],
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function zoneToCoords(zone: string | null): [number, number] | null {
  if (!zone) return null;
  const key = zone.toLowerCase().replace(/[- ]/g, "_");
  return ZONE_COORDS[key] ?? null;
}

type RawResult = {
  id: string;
  retailPrice: number;
  minOrderQty: number;
  product: {
    id: number;
    name: string;
    image: string | null;
    category: string;
    unit: string | null;
    stock: number | null;
  };
  store: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    zone: string | null;
    rating: number;
  };
};

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  const requestId = req.headers.get("x-request-id") ?? traceId;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      logger.warn("marketplace/search: parámetros inválidos", { requestId, issues: parsed.error.issues });
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { q, zone, category, minPrice, maxPrice, sort, lat, lng, radiusKm } = parsed.data;

    logger.info("marketplace/search", { requestId, q, zone, category, sort, minPrice, maxPrice });

    // orderBy en Prisma solo para los casos que el ORM puede resolver directamente
    const prismaOrderBy =
      sort === "price_desc"
        ? { retailPrice: "desc" as const }
        : sort === "name"
          ? { product: { name: "asc" as const } }
          : sort === "rating"
            ? { store: { rating: "desc" as const } }
            : { retailPrice: "asc" as const }; // price_asc | distance | default

    // TD-018: Prisma devuelve retailPrice / rating como Decimal — convertir después del query
    const rawResults = await prisma.storeProduct.findMany({
      where: {
        isActive: true,
        ...(minPrice !== undefined || maxPrice !== undefined
          ? {
              retailPrice: {
                ...(minPrice !== undefined && { gte: minPrice }),
                ...(maxPrice !== undefined && { lte: maxPrice }),
              },
            }
          : {}),
        store: {
          isPublished: true,
          ...(zone && { zone }),
        },
        product: {
          name: { contains: q, mode: "insensitive" },
          ...(category && category !== "todos" && { category }),
        },
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
        store: {
          select: {
            id:     true,
            name:   true,
            slug:   true,
            logo:   true,
            zone:   true,
            rating: true,
          },
        },
      },
      orderBy: prismaOrderBy,
      take: 80, // margen para ordenar por distancia en post-process
    });

    // TD-018: serializar Decimal → number para que encaje con RawResult
    const results: RawResult[] = rawResults.map((r) => ({
      ...r,
      retailPrice: toNumOrZero(r.retailPrice),
      store: {
        ...r.store,
        rating: toNumOrZero(r.store.rating),
      },
    }));

    // Post-process: filtrar/ordenar por distancia cuando el cliente envía coordenadas GPS
    let finalResults = results;

    if (lat !== undefined && lng !== undefined) {
      const radius = radiusKm ?? 5;

      // Filtrar por radio (solo si la tienda tiene zona con coords aproximadas)
      finalResults = results.filter((r) => {
        const coords = zoneToCoords(r.store.zone);
        if (!coords) return true; // sin coords → incluir (beneficio de la duda)
        return haversineKm(lat, lng, coords[0], coords[1]) <= radius;
      });

      // Ordenar por cercanía si se solicitó
      if (sort === "distance") {
        finalResults = [...finalResults].sort((a, b) => {
          const coordsA = zoneToCoords(a.store.zone);
          const coordsB = zoneToCoords(b.store.zone);
          const distA = coordsA ? haversineKm(lat, lng, coordsA[0], coordsA[1]) : 9999;
          const distB = coordsB ? haversineKm(lat, lng, coordsB[0], coordsB[1]) : 9999;
          return distA - distB;
        });
      }
    }

    const topItems = finalResults.slice(0, 50);
    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    const productIds = topItems.map((r) => r.product.id);

    const { primaryImageMap, variantMap, ratingMap, bestSellerIds } =
      productIds.length > 0
        ? await batchProductEnrichment(productIds, tenantId)
        : { primaryImageMap: new Map(), variantMap: new Map(), ratingMap: new Map(), bestSellerIds: new Set<number>() };

    // Proxy para badge "new": IDs en el top 10% del rango = producto reciente
    const maxId = productIds.length > 0 ? Math.max(...productIds) : 0;
    const newThreshold = maxId * 0.9;

    const data = topItems.map((r) => {
      const pid = r.product.id;
      const stock = r.product.stock ?? 0;

      const badges: string[] = [];
      if (pid >= newThreshold && newThreshold > 0) badges.push("new");
      if (stock > 0 && stock < 5) badges.push("low-stock");
      if (bestSellerIds.has(pid)) badges.push("best-seller");
      if (r.store.rating > 4.5) badges.push("verified");

      return {
        productId:   pid,
        productName: r.product.name,
        price:       r.retailPrice,
        image:       primaryImageMap.get(pid) ?? r.product.image,
        images:      primaryImageMap.has(pid) ? [primaryImageMap.get(pid)!] : (r.product.image ? [r.product.image] : []),
        unit:        r.product.unit,
        category:    r.product.category,
        stock,
        hasVariants: (variantMap.get(pid) ?? 0) > 0,
        avgRating:   Math.round((ratingMap.get(pid) ?? 0) * 10) / 10,
        badges,
        storeId:     r.store.id,
        storeName:   r.store.name,
        storeSlug:   r.store.slug,
        storeLogo:   r.store.logo,
        storeZone:   r.store.zone,
        storeRating: r.store.rating,
      };
    });

    // Fire-and-forget: registrar la búsqueda para autocompletado/autocorrección
    SearchSuggestionsDB.record(tenantId, q, data.length).catch((err) => logger.error("[marketplace/search] operation failed", { error: String(err), tenantId }));

    // Si hay resultados, aplicar boosts (sponsored products)
    let finalData = data;
    let didYouMean: { suggestion: string; similarity: number }[] = [];
    let fuzzyMatches: { productId: number; productName: string; category: string; image: string | null; similarity: number }[] = [];

    if (data.length === 0) {
      // Sin resultados exactos → fuzzy + did-you-mean
      [fuzzyMatches, didYouMean] = await Promise.all([
        SearchSuggestionsDB.getProductFuzzyMatches(tenantId, q),
        SearchSuggestionsDB.getDidYouMean(tenantId, q),
      ]);
    } else {
      // Con resultados → aplicar sponsored ranking
      finalData = await applyBoostsToProducts(tenantId, data);
    }

    return NextResponse.json({
      data: finalData,
      total: finalData.length,
      query: q,
      ...(didYouMean.length > 0 && { didYouMean }),
      ...(fuzzyMatches.length > 0 && { fuzzyMatches }),
    });
  } catch (err) {
    logger.error("marketplace/search: error inesperado", { requestId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
