import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AssetsDB, assetServiceSku } from "@/lib/db/assets.db";
import { ProductsDB } from "@/lib/db/products.db";
import { logger } from "@/lib/logger";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * Publicar / despublicar un activo como SERVICIO de alquiler en la tienda.
 * Brandon 2026-06-06 (opción A: servicio vinculado).
 *
 * POST   → crea/reactiva una ficha de servicio (type=service, sin stock)
 *          vinculada al activo por sku "asset:<id>". Aparece en tienda/marketplace
 *          y NO entra a la valuación de inventario (los servicios sin stock se
 *          excluyen). El activo conserva su rentabilidad en Activos.
 * DELETE → quita la ficha de la tienda (desactiva, no borra; se puede republicar).
 */

const CATEGORY = "alquiler";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const asset = await AssetsDB.getOne(auth.tenantId, id);
    if (!asset) return NextResponse.json({ error: "Activo no encontrado" }, { status: 404 });

    const sku = assetServiceSku(id);
    const existing = await ProductsDB.getBySku(auth.tenantId, sku);
    const fields = {
      name: asset.name,
      category: CATEGORY,
      price: asset.hourlyRate ?? existing?.price ?? 0,
      image: asset.imageUrl ?? existing?.image ?? "",
      unit: asset.rateUnit,
      description: asset.notes ?? `Alquiler de ${asset.name}`,
      type: "service",
      stock: null, stockMin: null, stockMax: null,
      sku,
      pricingUnit: asset.rateUnit,
      durationLabel: `por ${asset.rateUnit}`,
      active: true,
      tenantId: auth.tenantId,
    };
    const product = existing
      ? await ProductsDB.upsert({ ...existing, ...fields, id: existing.id })
      : await ProductsDB.create(fields);

    logger.info("[assets] published as service", { tenantId: auth.tenantId, assetId: id, productId: product.id });
    return NextResponse.json({ data: { productId: product.id, published: true } }, { status: existing ? 200 : 201 });
  } catch (err) {
    logger.error("[assets] publish failed", { err: String(err), id });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const existing = await ProductsDB.getBySku(auth.tenantId, assetServiceSku(id));
    if (existing) await ProductsDB.upsert({ ...existing, active: false });
    return NextResponse.json({ data: { published: false } });
  } catch (err) {
    logger.error("[assets] unpublish failed", { err: String(err), id });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
