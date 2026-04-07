export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { ProductVariantsDB } from "@/lib/db/product-variants.db";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logActivity } from "@/lib/activity-logger";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const PostSchema = z.object({
  name: z.string().min(1).max(100),
  sku: z.string().max(50).optional(),
  priceModifier: z.number(),
  stock: z.int().min(0).optional(),
  attributesJson: z.string().max(500).optional(),
});

const PutSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sku: z.string().max(50).optional(),
  priceModifier: z.number().optional(),
  stock: z.int().min(0).optional(),
  attributesJson: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  position: z.int().min(0).optional(),
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

    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    const cacheKey = `marketplace:product:${productId}:variants`;

    const variants = await getOrSet(cacheKey, 300, () =>
      ProductVariantsDB.list(tenantId, productId)
    );

    return NextResponse.json({ data: variants });
  } catch (err) {
    logger.error("marketplace/products/variants GET: error", { traceId, err });
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

    const body = await req.json();
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
    }

    const variant = await ProductVariantsDB.create(auth.tenantId, {
      productId,
      ...parsed.data,
    });

    invalidateByPrefix(`marketplace:product:${productId}`);

    logActivity("create", "product_variant", `productId:${productId}`, variant.id, auth.username, undefined, auth.tenantId).catch(() => {});

    return NextResponse.json({ data: variant }, { status: 201 });
  } catch (err) {
    logger.error("marketplace/products/variants POST: error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const traceId = newTraceId();
  try {
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "ID de producto inválido" }, { status: 400 });
    }

    const auth = await requireAdmin(req, ["admin", "almacenero"]);
    if (auth instanceof NextResponse) return auth;

    const variantId = new URL(req.url).searchParams.get("variantId");
    if (!variantId) {
      return NextResponse.json({ error: "variantId requerido" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = PutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
    }

    const updated = await ProductVariantsDB.update(auth.tenantId, variantId, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Variante no encontrada" }, { status: 404 });
    }

    invalidateByPrefix(`marketplace:product:${productId}`);

    logActivity("update", "product_variant", `productId:${productId}`, variantId, auth.username, undefined, auth.tenantId).catch(() => {});

    return NextResponse.json({ data: updated });
  } catch (err) {
    logger.error("marketplace/products/variants PUT: error", { traceId, err });
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

    const variantId = new URL(req.url).searchParams.get("variantId");
    if (!variantId) {
      return NextResponse.json({ error: "variantId requerido" }, { status: 400 });
    }

    await ProductVariantsDB.delete(auth.tenantId, variantId);
    invalidateByPrefix(`marketplace:product:${productId}`);

    logActivity("delete", "product_variant", `productId:${productId}`, variantId, auth.username, undefined, auth.tenantId).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("marketplace/products/variants DELETE: error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
