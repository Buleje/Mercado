import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/marketplace/deals — productos REALES en oferta cross-store.
 *
 * Definición de "oferta": StoreProduct cuyo `retailPrice` es menor al
 * `Product.price` (precio base). Sin mocks, sin rellenos. Si no hay nada,
 * devuelve `data: []` para que el cliente muestre empty state honesto.
 *
 * Cache: 120s — los precios cambian rara vez y este endpoint puede ser
 * llamado por varios módulos (hero ofertas, cards mini, banners).
 */

const QuerySchema = z.object({
  category:    z.string().optional(),
  storeSlug:   z.string().optional(),
  minDiscount: z.coerce.number().min(0).max(100).default(1),
  limit:       z.coerce.number().int().min(1).max(120).default(60),
  sort:        z.enum(["discount_desc", "price_asc", "ends_soon"]).default("discount_desc"),
  /** Si no hay ofertas reales (descuento > minDiscount), devolver los más
   *  baratos del marketplace como "destacados", sin inventar descuento. */
  fallbackToLowest: z.coerce.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { category, storeSlug, minDiscount, limit, sort, fallbackToLowest } = parsed.data;
    const cacheKey = `marketplace:deals:${JSON.stringify({ category, storeSlug, minDiscount, limit, sort, fallbackToLowest })}`;

    const result = await getOrSet(cacheKey, 120, async () => {
      const rows = await prisma.storeProduct.findMany({
        where: {
          isActive: true,
          store: {
            isPublished: true,
            ...(storeSlug && { slug: storeSlug }),
          },
          ...(category && { product: { category, active: true, deletedAt: null } }),
          ...(!category && { product: { active: true, deletedAt: null } }),
        },
        select: {
          id:          true,
          retailPrice: true,
          minOrderQty: true,
          store: {
            select: { id: true, slug: true, name: true, logo: true, zone: true, category: true },
          },
          product: {
            select: {
              id:       true,
              name:     true,
              image:    true,
              category: true,
              unit:     true,
              price:    true, // precio base — comparamos contra retailPrice
              stock:    true,
              badge:    true,
            },
          },
        },
        // pull more than `limit` so we can filter for discounts and still have enough
        take: Math.max(limit * 4, 200),
      });

      const deals = rows
        .map((sp) => {
          const base = Number(sp.product.price);
          const sale = Number(sp.retailPrice);
          if (!Number.isFinite(base) || !Number.isFinite(sale) || base <= 0) return null;
          if (sale >= base) return null;
          const discountPct = Math.round(((base - sale) / base) * 100);
          if (discountPct < minDiscount) return null;
          return {
            id:             sp.id,
            productId:      sp.product.id,
            name:           sp.product.name,
            image:          sp.product.image || null,
            category:       sp.product.category,
            unit:           sp.product.unit,
            badge:          sp.product.badge ?? null,
            price:          sale,
            originalPrice:  base,
            discountPct,
            stock:          sp.product.stock ?? 0,
            minOrderQty:    sp.minOrderQty,
            store: {
              slug:     sp.store.slug,
              name:     sp.store.name,
              logo:     sp.store.logo,
              zone:     sp.store.zone,
              category: sp.store.category,
            },
          };
        })
        .filter((d): d is NonNullable<typeof d> => d !== null);

      const sorted = [...deals].sort((a, b) => {
        if (sort === "price_asc") return a.price - b.price;
        // ends_soon no aplica a este modelo (sin endsAt) — fallback a discount
        return b.discountPct - a.discountPct;
      });

      if (sorted.length > 0 || !fallbackToLowest) {
        return { items: sorted.slice(0, limit), source: "deals" as const };
      }

      // Fallback honesto: cheapest items del marketplace (sin descuento inventado)
      const featured = rows
        .map((sp) => {
          const sale = Number(sp.retailPrice);
          if (!Number.isFinite(sale) || sale <= 0) return null;
          return {
            id:             sp.id,
            productId:      sp.product.id,
            name:           sp.product.name,
            image:          sp.product.image || null,
            category:       sp.product.category,
            unit:           sp.product.unit,
            badge:          sp.product.badge ?? null,
            price:          sale,
            originalPrice:  null as number | null,
            discountPct:    0,
            stock:          sp.product.stock ?? 0,
            minOrderQty:    sp.minOrderQty,
            store: {
              slug:     sp.store.slug,
              name:     sp.store.name,
              logo:     sp.store.logo,
              zone:     sp.store.zone,
              category: sp.store.category,
            },
          };
        })
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .sort((a, b) => a.price - b.price)
        .slice(0, limit);

      return { items: featured, source: "lowest" as const };
    });

    logger.info("[marketplace/deals] GET", { traceId, count: result.items.length, source: result.source });

    return NextResponse.json(
      { data: result.items, total: result.items.length, source: result.source },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } },
    );
  } catch (err) {
    logger.error("[marketplace/deals] GET error", { traceId, err: String(err) });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
