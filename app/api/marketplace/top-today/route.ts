/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 * Migrar a `lib/db/marketplace-*.db.ts` cuando se cree clase específica.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/marketplace/top-today
 *
 * Ranking de productos más pedidos en las últimas 24h en el marketplace.
 * Público — sin auth. Fallback a últimos 7 días si hoy hay menos de 5 resultados.
 *
 * Response:
 *   { items: TopProduct[], window: "24h" | "7d", updatedAt: string }
 */

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      20,
      Math.max(5, Number(searchParams.get("limit") ?? 10) || 10),
    );

    const now = new Date();
    const start24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const start7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    async function topInWindow(fromDate: Date) {
      return prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          order: {
            source: "marketplace",
            deletedAt: null,
            createdAt: { gte: fromDate },
          },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: limit,
      });
    }

    let window: "24h" | "7d" = "24h";
    let ranking = await topInWindow(start24h).catch(() => []);

    if (ranking.length < 5) {
      window = "7d";
      ranking = await topInWindow(start7d).catch(() => []);
    }

    if (ranking.length === 0) {
      return NextResponse.json(
        { items: [], window, updatedAt: now.toISOString() },
        { headers: { "Cache-Control": "public, max-age=120, s-maxage=120, stale-while-revalidate=600" } },
      );
    }

    const productIds = ranking
      .map((r) => r.productId)
      .filter((x): x is number => x != null && typeof x === "number");

    // Fetch storeProducts enriched with store + product info.
    // We pick the first active storeProduct per productId for a representative price.
    const storeProducts = await prisma.storeProduct.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
        store: { isPublished: true, vacationMode: { not: true } },
      },
      select: {
        id: true,
        retailPrice: true,
        productId: true,
        product: {
          select: {
            id: true,
            name: true,
            image: true,
            unit: true,
            stock: true,
          },
        },
        store: {
          select: {
            slug: true,
            name: true,
            rating: true,
          },
        },
      },
    });

    // Pick one storeProduct per productId (prefer higher-rated store)
    const bestByProduct = new Map<number, (typeof storeProducts)[number]>();
    for (const sp of storeProducts) {
      const prev = bestByProduct.get(sp.productId);
      if (!prev || (sp.store.rating ?? 0) > (prev.store.rating ?? 0)) {
        bestByProduct.set(sp.productId, sp);
      }
    }

    // Build ranking in order of quantity sold, skipping products without an active storeProduct
    const items = ranking
      .map((r) => {
        if (r.productId == null) return null;
        const sp = bestByProduct.get(r.productId);
        if (!sp) return null;
        return {
          storeProductId: sp.id,
          productId: sp.productId,
          name: sp.product.name,
          price: Number(sp.retailPrice),
          image: sp.product.image,
          unit: sp.product.unit,
          stock: sp.product.stock ?? 0,
          soldUnits: Number(r._sum.quantity ?? 0),
          store: {
            slug: sp.store.slug,
            name: sp.store.name,
            rating: Number(sp.store.rating ?? 0),
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return NextResponse.json(
      {
        items,
        window,
        updatedAt: now.toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=120, s-maxage=120, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    logger.error("[marketplace/top-today] failed", {
      error: err instanceof Error ? err.message : String(err),
      traceId,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
