import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

type RouteParams = { params: Promise<{ id: string }> };

type BadgeDetail = {
  lowStock?: number;
};

async function computeBadges(productId: number, tenantId: string, lat?: number, lng?: number) {
  const [product, storeProduct, topSellers, _avgRating] = await Promise.all([
    prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      select: { id: true, stock: true },
    }),
    prisma.storeProduct.findFirst({
      where: { productId, isActive: true },
      select: {
        store: {
          select: { rating: true, zone: true },
        },
      },
    }),
    // Top 5 productos por unidades vendidas en últimos 30 días
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        order: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    prisma.review.aggregate({
      where: { productId, tenantId, status: "approved", deletedAt: null },
      _avg: { rating: true },
    }),
  ]);

  const badges: string[] = [];
  const details: BadgeDetail = {};

  // Badge "new": proxy via ID — producto en el top 10% más reciente del tenant
  // Product no tiene createdAt; el ID autoincremental sirve como proxy de antigüedad
  const maxProductAgg = await prisma.product.aggregate({
    where: { tenantId, deletedAt: null },
    _max: { id: true },
  });
  const maxId = maxProductAgg._max.id ?? 0;
  if (product && maxId > 0 && product.id >= maxId * 0.9) {
    badges.push("new");
  }

  // Badge "low-stock"
  if (product?.stock != null && product.stock < 5) {
    badges.push("low-stock");
    details.lowStock = product.stock;
  }

  // Badge "best-seller": está en el top 5 más vendidos del tenant en 30 días
  const isBestSeller = topSellers.some((row) => row.productId === productId);
  if (isBestSeller) badges.push("best-seller");

  // Badge "verified": tienda con rating > 4.5
  if (storeProduct?.store && storeProduct.store.rating > 4.5) {
    badges.push("verified");
  }

  // Badge "fast-shipping": solo si el cliente envía coordenadas
  if (lat !== undefined && lng !== undefined && storeProduct?.store?.zone) {
    // Heurística simple: si la tienda tiene zona asignada, se asume entrega rápida local
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

    const tenantId = req.headers.get("x-tenant-id") ?? "main";
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
