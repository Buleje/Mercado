/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 * Migrar a `lib/db/marketplace-*.db.ts` cuando se cree clase específica.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/marketplace/catalog/sections
 *
 * Returns curated catalog sections for the marketplace home page:
 * - featured: highest-rated products from top stores
 * - flashDeals: products with active promotions/discounts
 * - topSellers: top 3 best-selling products (last 30 days)
 * - liquidations: products with very low stock (≤3) and still active
 */
export async function GET(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? "sections";

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const baseStoreFilter = {
      isPublished: true,
      vacationMode: { not: true },
    };

    const baseSelect = {
      id: true,
      retailPrice: true,
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
          rating: true,
        },
      },
    } as const;

    // Run all queries in parallel
    const [featuredRaw, topSellerData, lowStockRaw, flashDealRaw] = await Promise.all([
      // Featured: products from stores with rating ≥ 4, ordered by store rating
      prisma.storeProduct.findMany({
        where: {
          isActive: true,
          store: { ...baseStoreFilter, rating: { gte: 4 } },
          product: { stock: { gt: 0 } },
        },
        select: baseSelect,
        orderBy: { store: { rating: "desc" } },
        take: 8,
      }),

      // Top sellers: best-selling product IDs in last 30 days
      prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          order: {
            deletedAt: null,
            createdAt: { gte: thirtyDaysAgo },
          },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 6,
      }),

      // Liquidations: very low stock products (1-3 units)
      prisma.storeProduct.findMany({
        where: {
          isActive: true,
          store: baseStoreFilter,
          product: { stock: { gt: 0, lte: 3 } },
        },
        select: baseSelect,
        orderBy: { product: { stock: "asc" } },
        take: 8,
      }),

      // Flash deals: products from stores with active promotions
      // Note: Promotion model doesn't link directly to products,
      // so we fetch recently-added marketplace products as "deals"
      prisma.storeProduct.findMany({
        where: {
          isActive: true,
          store: baseStoreFilter,
          product: { stock: { gt: 0 }, active: true },
        },
        select: baseSelect,
        orderBy: { product: { id: "desc" } },
        take: 8,
      }),
    ]);

    // Resolve top seller products
    const topSellerIds = topSellerData.map((t) => t.productId).filter((id): id is number => id !== null);
    const topSellerProducts = topSellerIds.length > 0
      ? await prisma.storeProduct.findMany({
          where: {
            isActive: true,
            store: baseStoreFilter,
            product: { id: { in: topSellerIds }, stock: { gt: 0 } },
          },
          select: baseSelect,
          take: 6,
        })
      : [];

    // Format helper
    const formatProduct = (r: typeof featuredRaw[number], extra?: Record<string, unknown>) => ({
      storeProductId: r.id,
      productId: r.product.id,
      name: r.product.name,
      price: r.retailPrice,
      image: r.product.image,
      unit: r.product.unit,
      category: r.product.category,
      stock: r.product.stock ?? 0,
      storeId: r.store.id,
      storeName: r.store.name,
      storeSlug: r.store.slug,
      storeLogo: r.store.logo,
      storeRating: r.store.rating,
      ...extra,
    });

    // Sort top sellers by their sales rank
    const topSellerMap = new Map(topSellerData.map((t, i) => [t.productId, i]));
    const sortedTopSellers = [...topSellerProducts].sort(
      (a, b) => (topSellerMap.get(a.product.id) ?? 99) - (topSellerMap.get(b.product.id) ?? 99)
    );

    const sections = {
      featured: featuredRaw.map((r) => formatProduct(r)),
      flashDeals: flashDealRaw.map((r) => formatProduct(r)),
      topSellers: sortedTopSellers.slice(0, 3).map((r, i) => formatProduct(r, { rank: i + 1 })),
      liquidations: lowStockRaw.map((r) => formatProduct(r)),
    };

    return NextResponse.json({ data: sections });
  } catch (err) {
    logger.error("marketplace/catalog/sections error", { requestId, err });
    return NextResponse.json(
      { error: "Error cargando secciones del catálogo" },
      { status: 500 }
    );
  }
}
