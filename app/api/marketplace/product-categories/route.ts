/**
 * GET /api/marketplace/product-categories
 *
 * Devuelve las categorías de PRODUCTO reales presentes en el marketplace
 * (tiendas publicadas + activas), ordenadas por cantidad. Alimenta el subnav
 * mobile de categorías (MarketplaceCategoriesBar). Solo categorías con ≥1
 * producto → sin chips muertos.
 *
 * @cross-tenant intentional — endpoint público marketplace (ADR-082).
 */
import { NextRequest, NextResponse } from "next/server";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
import { verticalStoreCategories } from "@/lib/marketplace/verticals";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "marketplace-product-categories");
  if (rl) return rl;
  try {
    // Tanda mobile (Brandon 2026-06-11): ?v=<vertical> acota las subcategorías
    // a los productos de las tiendas de ese vertical (Ferretería → subcats de
    // ferretería). Sin `v` = todo el catálogo (comportamiento original).
    const v = req.nextUrl.searchParams.get("v");
    const storeCategories = v ? verticalStoreCategories(v) : undefined;
    const categories = await MarketplacePublicDB.getProductCategories(
      storeCategories && storeCategories.length > 0 ? storeCategories : undefined,
    );
    return NextResponse.json(
      { categories },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (err) {
    logger.error("[product-categories] failed", { err });
    // Barra no crítica: devolver lista vacía → la barra simplemente no aparece.
    return NextResponse.json({ categories: [] }, { status: 200 });
  }
}
