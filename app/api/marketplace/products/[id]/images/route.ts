export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { ProductImagesDB } from "@/lib/db/product-images.db";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logActivity } from "@/lib/activity-logger";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { isAllowedImageUrl } from "@/lib/url-allowlist";

const PostSchema = z.object({
  // F6: validar URL contra allowlist para prevenir SSRF
  url: z.string().url().max(500).refine(isAllowedImageUrl, "URL de imagen no permitida"),
  alt: z.string().max(200).optional(),
  position: z.int().min(0).optional(),
  isPrimary: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const traceId = newTraceId();
  try {
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "ID de producto inválido" }, { status: 400 });
    }

    // F1+F9: tenantId desde header; cache key incluye tenantId para aislamiento
    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    const cacheKey = `marketplace:product:${tenantId}:${productId}:images`;

    const images = await getOrSet(cacheKey, 300, () =>
      ProductImagesDB.list(tenantId, productId)
    );

    return NextResponse.json({ data: images });
  } catch (err) {
    logger.error("marketplace/products/images GET: error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const traceId = newTraceId();
  try {
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "ID de producto inválido" }, { status: 400 });
    }

    const auth = await requireAdmin(req, ["admin", "almacenero"]);
    if (auth instanceof NextResponse) return auth;

    // F3: verificar que el producto pertenece al tenant del admin (cross-tenant guard)
    const productOwner = await prisma.product.findFirst({
      where: { id: productId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!productOwner) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const body = await req.json().catch((err) => { logger.error("[marketplace/products/[id]/images] parse JSON body failed", { error: String(err) }); return null; });
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
    }

    const image = await ProductImagesDB.create(auth.tenantId, {
      productId,
      ...parsed.data,
    });

    // F9: cache key incluye tenantId
    invalidateByPrefix(`marketplace:product:${auth.tenantId}:${productId}`);

    logActivity("create", "product_image", `productId:${productId}`, image.id, auth.username, undefined, auth.tenantId).catch((err) => logger.error("[marketplace/products/[id]/images] activity log failed", { error: String(err), tenantId: auth.tenantId }));

    return NextResponse.json({ data: image }, { status: 201 });
  } catch (err) {
    logger.error("marketplace/products/images POST: error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const traceId = newTraceId();
  try {
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "ID de producto inválido" }, { status: 400 });
    }

    const auth = await requireAdmin(req, ["admin", "almacenero"]);
    if (auth instanceof NextResponse) return auth;

    // F3: verificar que el producto pertenece al tenant del admin
    const productOwner = await prisma.product.findFirst({
      where: { id: productId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!productOwner) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const imageId = new URL(req.url).searchParams.get("imageId");
    if (!imageId) {
      return NextResponse.json({ error: "imageId requerido" }, { status: 400 });
    }

    await ProductImagesDB.delete(auth.tenantId, imageId);
    // F9: cache key incluye tenantId
    invalidateByPrefix(`marketplace:product:${auth.tenantId}:${productId}`);

    logActivity("delete", "product_image", `productId:${productId}`, imageId, auth.username, undefined, auth.tenantId).catch((err) => logger.error("[marketplace/products/[id]/images] activity log failed", { error: String(err), tenantId: auth.tenantId }));

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("marketplace/products/images DELETE: error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
