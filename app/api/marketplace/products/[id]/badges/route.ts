/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 * Migrar a `lib/db/marketplace-*.db.ts` cuando se cree clase específica.
 */
import { NextRequest, NextResponse } from "next/server";
import { MarketplaceProductsDB } from "@/lib/db/marketplace-products.db";
import { getOrSet } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

type RouteParams = { params: Promise<{ id: string }> };

type BadgeDetail = {
  lowStock?: number;
};

async function computeBadges(productId: number, tenantId: string, lat?: number, lng?: number) {
  // Audit project-wide 2026-05-19: migrado a MarketplaceProductsDB.getBadgeData
  // (5 queries paralelas encapsuladas + select especifico).
  const { product, storeRating, storeZone, topSellerIds, maxProductId } =
    await MarketplaceProductsDB.getBadgeData(tenantId, productId);

  const badges: string[] = [];
  const details: BadgeDetail = {};

  // Badge "new": proxy via ID — producto en el top 10% mas reciente del tenant.
  // Product no tiene createdAt; el ID autoincremental sirve como proxy de antiguedad.
  if (product && maxProductId > 0 && product.id >= maxProductId * 0.9) {
    badges.push("new");
  }

  // Badge "low-stock"
  if (product?.stock != null && product.stock < 5) {
    badges.push("low-stock");
    details.lowStock = product.stock;
  }

  // Badge "best-seller": esta en el top 5 mas vendidos del tenant en 30 dias.
  if (topSellerIds.includes(productId)) badges.push("best-seller");

  // Badge "verified": tienda con rating > 4.5.
  if (storeRating != null && storeRating > 4.5) {
    badges.push("verified");
  }

  // Badge "fast-shipping": solo si el cliente envia coordenadas y store tiene zona.
  if (lat !== undefined && lng !== undefined && storeZone) {
    badges.push("fast-shipping");
  }

  return { badges, details, computedAt: new Date().toISOString() };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const traceId = newTraceId();
  try {
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "ID de producto inválido" }, { status: 400 });
    }

    // SECURITY 2026-05-06 (audit anterior HIGH #4): derivar tenantId del
    // producto mismo. Antes el header podía cruzar y un atacante con header
    // `x-tenant-id: tenant-A` podía leer badges agregados del producto si el
    // mismo productId existe en distintos tenants. La cache también quedaba
    // cross-contaminada por la key.
    // Audit project-wide 2026-05-19: migrado a MarketplaceProductsDB.getTenantById.
    const tenantId = await MarketplaceProductsDB.getTenantById(productId);
    if (!tenantId) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get("lat") ? Number(searchParams.get("lat")) : undefined;
    const lng = searchParams.get("lng") ? Number(searchParams.get("lng")) : undefined;

    // Cache solo cuando no hay coordenadas (resultado varía por lat/lng)
    if (lat === undefined || lng === undefined) {
      const cacheKey = `marketplace:product:${productId}:badges:${tenantId}`;
      const result = await getOrSet(cacheKey, 300, () =>
        computeBadges(productId, tenantId)
      );
      return NextResponse.json(result);
    }

    const result = await computeBadges(productId, tenantId, lat, lng);
    return NextResponse.json(result);
  } catch (err) {
    logger.error("marketplace/products/badges GET: error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
