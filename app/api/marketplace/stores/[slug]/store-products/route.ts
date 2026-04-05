export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { MarketplaceStoresDB, MarketplaceStoreProductsDB } from "@/lib/db/marketplace.db";
import { logActivity } from "@/lib/activity-logger";
import { toErrorPayload, newTraceId, NotFoundError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import type { SessionPayload } from "@/lib/session";

// Verifica que el usuario sea admin o dueño de la tienda específica.
// Retorna NextResponse 403 si no tiene permiso, null si está autorizado.
function assertStoreOwner(
  auth: Pick<SessionPayload, "role" | "tenantId">,
  store: { tenantId: string },
): NextResponse | null {
  if (auth.role !== "admin" && store.tenantId !== auth.tenantId) {
    return NextResponse.json(
      { error: "No tienes permiso para modificar esta tienda" },
      { status: 403 },
    );
  }
  return null;
}

const AddProductSchema = z.object({
  productId:          z.number().int().positive(),
  retailPrice:        z.number().positive(),
  wholesalePrice:     z.number().positive().optional(),
  minOrderQty:        z.number().int().min(1).optional(),
  volumePricingTiers: z.array(
    z.object({
      minQty:   z.number().int().min(1),
      discount: z.number().min(0).max(100),
    }),
  ).optional(),
});

const DeleteSchema = z.object({
  productId: z.number().int().positive(),
});

const QuerySchema = z.object({
  category: z.string().optional(),
  search:   z.string().max(100).optional(),
  sort:     z.enum(["price_asc", "price_desc"]).optional(),
  limit:    z.coerce.number().int().min(1).max(100).default(50),
});

// ─── GET — listar productos de la tienda ──────────────────────────────────────
// Público: cualquiera puede ver el catálogo de una tienda publicada.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const traceId = newTraceId();
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);

    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const store = await MarketplaceStoresDB.getBySlug(slug);
    if (!store) throw new NotFoundError("Tienda");

    const products = await MarketplaceStoreProductsDB.list({
      storeId:  store.id,
      category: parsed.data.category,
      search:   parsed.data.search,
      sort:     parsed.data.sort,
      limit:    parsed.data.limit,
    });

    logger.info("[marketplace/store-products] GET", { traceId, slug, count: products.length });
    return NextResponse.json({ data: products, total: products.length });
  } catch (err) {
    logger.error("[marketplace/store-products] GET error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// ─── POST — agregar / actualizar producto en la tienda ────────────────────────
// Protegido: solo admin o el dueño del tenant de la tienda.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "tienda_owner"]);
    if (auth instanceof NextResponse) return auth;

    const { slug } = await params;

    const store = await MarketplaceStoresDB.getBySlug(slug);
    if (!store) throw new NotFoundError("Tienda");

    const permError = assertStoreOwner(auth, store);
    if (permError) return permError;

    const body = await req.json().catch(() => ({}));
    const parsed = AddProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const storeProduct = await MarketplaceStoreProductsDB.upsert({
      storeId:            store.id,
      productId:          parsed.data.productId,
      retailPrice:        parsed.data.retailPrice,
      wholesalePrice:     parsed.data.wholesalePrice,
      minOrderQty:        parsed.data.minOrderQty,
      volumePricingTiers: parsed.data.volumePricingTiers,
    });

    logActivity(
      "Agregar",
      "marketplace_store_product",
      `Producto #${parsed.data.productId} agregado a tienda "${store.name}" a S/${parsed.data.retailPrice}`,
      store.id,
      auth.username,
    ).catch(() => {});

    logger.info("[marketplace/store-products] POST", { traceId, slug, productId: parsed.data.productId });
    return NextResponse.json({ data: storeProduct }, { status: 201 });
  } catch (err) {
    logger.error("[marketplace/store-products] POST error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// ─── DELETE — desactivar producto de la tienda ────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "tienda_owner"]);
    if (auth instanceof NextResponse) return auth;

    const { slug } = await params;
    const store = await MarketplaceStoresDB.getBySlug(slug);
    if (!store) throw new NotFoundError("Tienda");

    const permError = assertStoreOwner(auth, store);
    if (permError) return permError;

    const body = await req.json().catch(() => ({}));
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "productId inválido" }, { status: 400 });
    }

    await MarketplaceStoreProductsDB.deactivate(store.id, parsed.data.productId);

    logActivity(
      "Desactivar",
      "marketplace_store_product",
      `Producto #${parsed.data.productId} desactivado de tienda "${store.name}"`,
      store.id,
      auth.username,
    ).catch(() => {});

    logger.info("[marketplace/store-products] DELETE", { traceId, slug, productId: parsed.data.productId });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[marketplace/store-products] DELETE error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
