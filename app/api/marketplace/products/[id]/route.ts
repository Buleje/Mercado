/**
 * GET /api/marketplace/products/[id]
 *
 * Returns a single marketplace product with store info, images, and variants.
 * Public endpoint — no auth required (marketplace browsing).
 */

/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 * Migrar a `lib/db/marketplace-*.db.ts` cuando se cree clase específica.
 */
import { NextRequest, NextResponse } from "next/server";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
import { logger } from "@/lib/logger";


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const productId = parseInt(id, 10);

  if (isNaN(productId) || productId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const product = await MarketplacePublicDB.getPublicProduct(productId);

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data: product });
  } catch (err) {
    logger.error("[marketplace/products/[id]] Error", { error: String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
