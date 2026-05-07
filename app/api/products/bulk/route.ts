import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { ProductsDB } from "@/lib/db/products.db";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache";
import { applyRateLimit } from "@/lib/rate-limit";

const BulkDeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

const BulkUpdateSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
  fields: z.object({
    price: z.number().positive().optional(),
    priceAdjust: z.number().optional(), // percentage: +10 = +10%, -5 = -5%
    stock: z.number().min(0).optional(),
    stockMin: z.number().min(0).optional(),
    stockMax: z.number().min(0).optional(),
    category: z.string().min(1).max(100).optional(),
    active: z.boolean().optional(),
    badge: z.string().max(50).nullable().optional(),
    /** Permite borrar imagenes en bulk: pasar { image: "" } o { image: null }. */
    image: z.string().nullable().optional(),
  }).refine(
    (f) => Object.values(f).some((v) => v !== undefined),
    { message: "At least one field to update is required" },
  ),
});

// POST /api/products/bulk — bulk update products (admin only)
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "products-bulk"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BulkUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { ids, fields } = parsed.data;

  try {
    let updated = 0;

    if (fields.priceAdjust !== undefined) {
      // Percentage-based price adjustment requires per-product update
      // TD-018: p.price es Decimal
      const products = await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, price: true },
      });
      for (const p of products) {
        const newPrice = Math.max(0.01, +(toNumOrZero(p.price) * (1 + fields.priceAdjust / 100)).toFixed(2));
        await prisma.product.update({ where: { id: p.id }, data: { price: newPrice } });
        updated++;
      }
    } else {
      // All other fields can be applied uniformly
      const data: Record<string, unknown> = {};
      if (fields.price !== undefined) data.price = fields.price;
      if (fields.stock !== undefined) data.stock = fields.stock;
      if (fields.stockMin !== undefined) data.stockMin = fields.stockMin;
      if (fields.stockMax !== undefined) data.stockMax = fields.stockMax;
      if (fields.category !== undefined) data.category = fields.category;
      if (fields.active !== undefined) data.active = fields.active;
      if (fields.badge !== undefined) data.badge = fields.badge;
      // image: null o "" limpian la URL guardada — usado por bulk "Quitar imagenes"
      if (fields.image !== undefined) data.image = fields.image ?? "";

      const result = await prisma.product.updateMany({
        where: { id: { in: ids } },
        data,
      });
      updated = result.count;
    }

    const requestId = req.headers.get("x-request-id") ?? undefined;
    logActivity(
      "Bulk", "producto",
      `Actualización masiva de ${updated} producto(s): ${Object.keys(fields).join(", ")}`,
      undefined, "admin", requestId,
    ).catch((err) => logger.error("[products/bulk] logActivity POST failed", { error: String(err) }));
    invalidate(`dashboard:${auth.tenantId}`);

    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    logger.error("[products/bulk] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// DELETE /api/products/bulk — bulk soft-delete products (admin only)
export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "products-bulk"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  try {
    const deleted = await ProductsDB.bulkDelete(auth.tenantId, parsed.data.ids);

    const requestId = req.headers.get("x-request-id") ?? undefined;
    logActivity(
      "Eliminar", "producto",
      `Eliminación masiva de ${deleted} producto(s)`,
      undefined, "admin", requestId,
    ).catch((err) => logger.error("[products/bulk] logActivity DELETE failed", { error: String(err) }));
    invalidate(`dashboard:${auth.tenantId}`);

    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    logger.error("[products/bulk] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
