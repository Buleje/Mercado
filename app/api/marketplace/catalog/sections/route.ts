/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Delegado a MarketplaceAdminDB.getCatalogSections (ADR-082).
 */
import { NextRequest, NextResponse } from "next/server";
import { MarketplaceAdminDB } from "@/lib/db/marketplace-public.db";
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
    const { featuredRaw, flashDealRaw, sortedTopSellers, lowStockRaw } =
      await MarketplaceAdminDB.getCatalogSections();

    type SectionRow = typeof featuredRaw[number];
    const formatProduct = (r: SectionRow, extra?: Record<string, unknown>) => ({
      storeProductId: r.id,
      productId:      r.product.id,
      name:           r.product.name,
      price:          r.retailPrice,
      image:          r.product.image,
      unit:           r.product.unit,
      category:       r.product.category,
      stock:          r.product.stock ?? 0,
      storeId:        r.store.id,
      storeName:      r.store.name,
      storeSlug:      r.store.slug,
      storeLogo:      r.store.logo,
      storeRating:    r.store.rating,
      ...extra,
    });

    const sections = {
      featured:     featuredRaw.map((r) => formatProduct(r)),
      flashDeals:   flashDealRaw.map((r) => formatProduct(r)),
      topSellers:   sortedTopSellers.slice(0, 3).map((r, i) => formatProduct(r, { rank: i + 1 })),
      liquidations: lowStockRaw.map((r) => formatProduct(r)),
    };

    return NextResponse.json({ data: sections });
  } catch (err) {
    logger.error("marketplace/catalog/sections error", { requestId, err });
    return NextResponse.json(
      { error: "Error cargando secciones del catálogo" },
      { status: 500 },
    );
  }
}
