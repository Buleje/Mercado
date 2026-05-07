import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// ── Schemas ────────────────────────────────────────────────────────────────

const GetSchema = z.object({
  productId: z.coerce.number().int().positive(),
});

const TierSchema = z.object({
  minQty:   z.number().int().min(1),
  discount: z.number().min(0).max(100),
});

const PostSchema = z.object({
  productId: z.number().int().positive(),
  tiers:     z.array(TierSchema).min(0),
});

// Tipo interno para los tiers almacenados como JSON
type VolumeTier = { minQty: number; discount: number };

// ── GET /api/wholesale/pricing?productId=X ─────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const traceId = newTraceId();
  try {
    const url    = new URL(req.url);
    const parsed = GetSchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { productId } = parsed.data;

    // Buscar StoreProduct del tenant actual
    const store = await prisma.store.findFirst({
      where: { tenantId: auth.tenantId },
      select: { id: true },
    });

    if (!store) {
      return NextResponse.json({ data: [] });
    }

    const storeProduct = await prisma.storeProduct.findUnique({
      where:  { storeId_productId: { storeId: store.id, productId } },
      select: { wholesalePrice: true, volumePricingTiers: true },
    });

    const tiers = (storeProduct?.volumePricingTiers as VolumeTier[] | null) ?? [];

    return NextResponse.json({
      data: {
        productId,
        wholesalePrice: storeProduct?.wholesalePrice ?? null,
        tiers,
      },
    });
  } catch (err) {
    logger.error("[wholesale/pricing] GET error", {
      err: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
      traceId,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// ── POST /api/wholesale/pricing ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "wholesale-pricing"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const traceId = newTraceId();
  try {
    const body   = await req.json();
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { productId, tiers } = parsed.data;

    // Ordenar tiers de menor a mayor minQty para facilitar la aplicación
    const sortedTiers = [...tiers].sort((a, b) => a.minQty - b.minQty);

    const store = await prisma.store.findFirst({
      where: { tenantId: auth.tenantId },
      select: { id: true },
    });

    if (!store) {
      return NextResponse.json(
        { error: "No se encontró tienda para este tenant" },
        { status: 404 },
      );
    }

    const storeProduct = await prisma.storeProduct.upsert({
      where:  { storeId_productId: { storeId: store.id, productId } },
      update: { volumePricingTiers: sortedTiers },
      create: {
        storeId:            store.id,
        productId,
        retailPrice:        0,
        volumePricingTiers: sortedTiers,
      },
      select: { id: true, productId: true, wholesalePrice: true, volumePricingTiers: true },
    });

    logger.info("[wholesale/pricing] POST updated tiers", {
      productId,
      tierCount: sortedTiers.length,
      tenantId: auth.tenantId,
      traceId,
    });

    logActivity(
      "update",
      "wholesale_pricing",
      `Precios por volumen actualizados para producto #${productId} (${sortedTiers.length} tramos)`,
      String(productId),
      auth.tenantId,
    ).catch(() => {});

    return NextResponse.json(
      {
        data: {
          productId:     storeProduct.productId,
          wholesalePrice: storeProduct.wholesalePrice,
          tiers:         (storeProduct.volumePricingTiers as VolumeTier[]) ?? [],
        },
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("[wholesale/pricing] POST error", {
      err: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
      traceId,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
