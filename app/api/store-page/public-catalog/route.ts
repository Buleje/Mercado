import { NextRequest, NextResponse } from "next/server";
import { StorePageDB } from "@/lib/db/store-page.db";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";

/**
 * GET /api/store-page/public-catalog
 *
 * Endpoint PÚBLICO (sin auth) que devuelve solo productos con `visible=true`
 * para la tienda individual `/t/[slug]/tienda`. Si un producto no tiene
 * override, se considera visible por default.
 *
 * - Respeta `tenantId` del header `x-tenant-id` (seteado por el middleware
 *   tenant.ts a partir del segmento de URL).
 * - Solo devuelve campos seguros para público (sin costPrice, stockMin, etc).
 */
export async function GET(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) {
    return NextResponse.json({ error: "tenant required" }, { status: 400 });
  }

  try {
    const list = await withDbRetry(() =>
      StorePageDB.listCatalogWithVisibility(tenantId),
    );
    // Filtra visible=true + active y expone solo campos públicos
    const publicItems = list
      .filter((p) => p.visible && p.active)
      .map((p) => ({
        productId: p.productId,
        name: p.name,
        image: p.image,
        category: p.category,
        unit: p.unit,
        price: p.price,
        stock: p.stock,
      }));
    return NextResponse.json(publicItems);
  } catch (e) {
    logger.error("[store-page/public-catalog] GET error", {
      err: e instanceof Error ? e.message : String(e),
      tenantId,
    });
    return NextResponse.json([], { status: 200 });
  }
}
