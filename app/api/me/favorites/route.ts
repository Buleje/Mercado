/**
 * GET /api/me/favorites
 *
 * Customer favorite products — server-side enrichment.
 * Favorites are stored client-side (localStorage) via FavoritesContext.
 * This endpoint accepts a list of product IDs and returns enriched data
 * (current price, stock, image) for the customer's favorites.
 *
 * Query: ?ids=1,2,3,4,5 (comma-separated product IDs)
 *
 * Auth: requireCustomer
 */

import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { ProductsDB } from "@/lib/db/products.db";
import { slugify } from "@/data/products";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { tenantId } = customer;

  // Parse product IDs from query string
  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const productIds = idsParam
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);

  if (productIds.length === 0) {
    return NextResponse.json({ favorites: [], count: 0 });
  }

  // Cap at 50 to prevent abuse
  const cappedIds = productIds.slice(0, 50);

  try {
    const allProducts = await ProductsDB.getAll(tenantId);
    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    const enriched = cappedIds
      .map((id) => {
        const product = productMap.get(id);
        if (!product || product.active === false) {
          return {
            productId: id,
            name: "Producto no disponible",
            price: 0,
            image: "/placeholder-product.png",
            unit: "und",
            slug: "",
            category: "",
            inStock: false,
            removed: true,
          };
        }
        return {
          productId: product.id,
          name: product.name,
          price: product.price,
          image: product.image ?? "/placeholder-product.png",
          unit: product.unit ?? "und",
          slug: slugify(product.name),
          category: product.category,
          inStock: (product.stock ?? 0) > 0,
          stock: product.stock ?? 0,
          removed: false,
        };
      });

    return NextResponse.json({
      favorites: enriched.filter((f) => !f.removed),
      unavailable: enriched.filter((f) => f.removed),
      count: enriched.filter((f) => !f.removed).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[me/favorites] Error", { tenantId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
