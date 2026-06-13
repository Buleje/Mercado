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
import { resolveMarketplaceTenant } from "@/lib/auth/resolve-marketplace-tenant";
import { logger } from "@/lib/logger";
import { applyBoostsToProducts } from "@/lib/marketplace/sponsored-ranker";
import { applyRateLimit } from "@/lib/rate-limit";
import { verticalStoreCategories } from "@/lib/marketplace/verticals";


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
  // Vertical (Comida/Bodega/Ferretería/Electro/Farmacia) → filtra por tipo de
  // tienda. Brandon 2026-06-11 (Inicio food-first, materiales a un toque).
  vertical: z.string().max(40).optional(),
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

/**
 * Brandon 2026-06-12: reordena una página de productos en round-robin por
 * tienda (1 de cada tienda por vuelta) conservando el orden relativo dentro de
 * cada tienda. Así el catálogo mezcla negocios en vez de mostrar todo de uno y
 * después otro. Es reordenamiento de DISPLAY de la página — no toca el cursor.
 */
function roundRobinByStore<T>(items: T[], storeIdOf: (it: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = storeIdOf(it);
    const bucket = groups.get(k);
    if (bucket) bucket.push(it);
    else groups.set(k, [it]);
  }
  // Una sola tienda → nada que mezclar.
  if (groups.size <= 1) return items;
  const buckets = [...groups.values()];
  const out: T[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const b of buckets) {
      const next = b.shift();
      if (next) {
        out.push(next);
        added = true;
      }
    }
  }
  return out;
}

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

    const { q, category, vertical, storeSlug, zone, minPrice, maxPrice, sort, cursor, limit } =
      parsed.data;

    // Vertical → set de tipos de tienda (vacío = sin filtro de vertical).
    const storeCategories = vertical ? verticalStoreCategories(vertical) : undefined;

    logger.info("marketplace/catalog", {
      requestId,
      q,
      category,
      vertical,
      zone,
      sort,
      limit,
    });

    // cross-tenant OK — enriquecimiento usa tenantId solo para imágenes/variantes del tenant que sirve el catálogo
    const tenantId = resolveMarketplaceTenant(req, { context: "marketplace/catalog" });

    // Brandon 2026-06-12: distribución EQUITATIVA en "popular" (Destacados). Con
    // orderBy store.rating la tienda top llena toda la página; round-robin a
    // nivel página no alcanza. Solución: para popular traemos una VENTANA amplia,
    // la intercalamos round-robin por tienda y paginamos por OFFSET (el cursor es
    // el índice). Los demás sorts (precio/nuevos) ya intercalan natural y siguen
    // con cursor-por-id.
    const isMixed = sort === "popular";
    const MIX_WINDOW = 240;
    const offset = isMixed && cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0;

    const results = await MarketplacePublicDB.getCatalogPage({
      q,
      category,
      storeCategories,
      storeSlug,
      zone,
      minPrice,
      maxPrice,
      sort,
      cursor: isMixed ? undefined : cursor,
      limit: isMixed ? MIX_WINDOW : limit,
      // ADR-131: la vista CROSS-STORE (Inicio, producto-first) excluye productos
      // PREPARADOS (comida al momento → tienda-first). Cuando hay storeSlug es una
      // vista dentro de una tienda → se ven todos (incluidos los preparados).
      excludePrepared: !storeSlug,
    });

    let items: typeof results;
    let hasMore: boolean;
    let nextCursor: string | undefined;
    if (isMixed) {
      const mixed = roundRobinByStore(results, (r) => r.store.id);
      items = mixed.slice(offset, offset + limit);
      hasMore = mixed.length > offset + limit;
      nextCursor = hasMore ? String(offset + limit) : undefined;
    } else {
      hasMore = results.length > limit;
      items = results.slice(0, limit);
      nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    }

    const productIds = items.map((r) => r.product.id);
    const { primaryImageMap, variantMap, ratingMap, bestSellerIds, commentCountMap } =
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
        // Brandon 2026-06-12: descripción corta para mostrar en la card (1 línea
        // con line-clamp). Antes el adapter del catálogo la descartaba.
        description: r.product.description ?? null,
        price: r.retailPrice,
        image: primaryImageMap.get(pid) ?? r.product.image,
        images: primaryImageMap.has(pid) ? [primaryImageMap.get(pid)!] : (r.product.image ? [r.product.image] : []),
        unit: r.product.unit,
        category: r.product.category,
        stock,
        hasVariants: (variantMap.get(pid) ?? 0) > 0,
        avgRating: Math.round((ratingMap.get(pid) ?? 0) * 10) / 10,
        commentCount: commentCountMap.get(pid) ?? 0,
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

    // Aplicar sponsored ranking (máx 3 por página al tope). El orden equitativo
    // (round-robin por tienda) ya se aplicó arriba a nivel filas para "popular".
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
