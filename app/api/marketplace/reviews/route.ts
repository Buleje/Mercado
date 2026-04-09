import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ReviewsMarketplaceDB } from "@/lib/db/reviews.db";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";
import { isFeatureEnabled } from "@/lib/feature-flags";

/**
 * Endpoint PÚBLICO del marketplace para crear reviews verificadas.
 *
 * POST /api/marketplace/reviews
 *   → el buyer crea una review linkeada a su orderId
 *   → la review se crea con verified=true y status=pending (requiere moderación)
 *
 * GET /api/marketplace/reviews?storeSlug=xxx&limit=50
 *   → lista las reviews aprobadas de una tienda (público)
 *
 * Feature flag: marketplace-reviews-public (arranca OFF)
 * Seguridad: la verificación del orderId se hace en ReviewsMarketplaceDB.createVerified()
 */

const CreateBody = z.object({
  storeSlug:      z.string().min(1).max(200),
  productId:      z.number().int().positive().optional(),
  orderId:        z.string().min(1).max(100),
  name:           z.string().min(1).max(150),
  phone:          z.string().min(6).max(20),
  text:           z.string().min(1).max(2000),
  rating:         z.number().int().min(1).max(5),
  qualityRating:  z.number().int().min(1).max(5).optional(),
  priceRating:    z.number().int().min(1).max(5).optional(),
  deliveryRating: z.number().int().min(1).max(5).optional(),
  photosJson:     z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("marketplace-reviews-public")) {
    return NextResponse.json(
      { error: "Reviews temporalmente no disponibles" },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    // 1. Resolver tienda por slug para obtener tenantId + storeId
    const store = await prisma.store.findUnique({
      where: { slug: parsed.data.storeSlug },
      select: { id: true, tenantId: true, isPublished: true, name: true },
    });
    if (!store || !store.isPublished) {
      return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
    }

    // 2. Crear la review (la verificación del orderId la hace la DB class)
    const review = await ReviewsMarketplaceDB.createVerified({
      tenantId:       store.tenantId,
      storeId:        store.id,
      productId:      parsed.data.productId ?? null,
      orderId:        parsed.data.orderId,
      name:           parsed.data.name,
      phone:          parsed.data.phone,
      text:           parsed.data.text,
      rating:         parsed.data.rating,
      qualityRating:  parsed.data.qualityRating,
      priceRating:    parsed.data.priceRating,
      deliveryRating: parsed.data.deliveryRating,
      photosJson:     parsed.data.photosJson,
    });

    // 3. Exponer sólo campos seguros (nunca tenantId, phone completo)
    return NextResponse.json(
      {
        data: {
          id:         review.id,
          rating:     review.rating,
          text:       review.text,
          name:       review.name,
          verified:   review.verified,
          status:     review.status,
          storeName:  store.name,
          date:       review.date,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Errores de validación del orderId → 422
    if (msg.includes("Order") || msg.includes("teléfono")) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    logger.error("[marketplace/reviews] create failed", { err: msg });
    reportCriticalError(err instanceof Error ? err : new Error(msg), {
      module: "api/marketplace/reviews",
      extra: { verb: "POST", storeSlug: parsed.data.storeSlug },
      tags: { severity_user_facing: "true" },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!isFeatureEnabled("marketplace-reviews-public")) {
    return NextResponse.json(
      { error: "Reviews temporalmente no disponibles" },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }

  const storeSlug = req.nextUrl.searchParams.get("storeSlug") ?? "";
  const productIdRaw = req.nextUrl.searchParams.get("productId");
  const productId = productIdRaw ? Number(productIdRaw) : null;
  const verifiedOnly = req.nextUrl.searchParams.get("verifiedOnly") === "true";
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);

  if (!storeSlug) {
    return NextResponse.json({ error: "storeSlug requerido" }, { status: 400 });
  }

  try {
    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true, tenantId: true, isPublished: true, name: true },
    });
    if (!store || !store.isPublished) {
      return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
    }

    // Listar por producto si se pidió, si no por tienda
    const reviews = productId
      ? await ReviewsMarketplaceDB.listByProduct(store.tenantId, productId, {
          status: "approved",
          limit,
          verifiedOnly,
        })
      : await ReviewsMarketplaceDB.listByStore(store.tenantId, store.id, {
          status: "approved",
          limit,
          verifiedOnly,
        });

    const aggregate = await ReviewsMarketplaceDB.getAggregate(store.tenantId, {
      storeId: productId ? undefined : store.id,
      productId: productId ?? undefined,
    });

    // Whitelist de campos seguros (NO exponer phone, tenantId, orderId, photosJson interno)
    const safe = reviews.map((r) => ({
      id:               r.id,
      rating:           r.rating,
      text:             r.text,
      name:             r.name,
      verified:         r.verified,
      helpfulUpvotes:   r.helpfulUpvotes,
      helpfulDownvotes: r.helpfulDownvotes,
      adminReply:       r.adminReply,
      adminReplyDate:   r.adminReplyDate,
      date:             r.date,
      qualityRating:    r.qualityRating,
      priceRating:      r.priceRating,
      deliveryRating:   r.deliveryRating,
    }));

    return NextResponse.json(
      {
        data: safe,
        aggregate,
      },
      {
        headers: {
          "X-Total-Count": String(safe.length),
          "Cache-Control": "public, max-age=30, s-maxage=60",
          "X-Robots-Tag":  "noindex, nofollow",
        },
      },
    );
  } catch (err) {
    logger.error("[marketplace/reviews] list failed", { err: String(err) });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/marketplace/reviews",
      extra: { verb: "GET", storeSlug },
      tags: { severity_user_facing: "true" },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
