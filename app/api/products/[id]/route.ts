import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProductsDB, PriceHistoryDB } from "@/lib/jsondb";
import { logActivity } from "@/lib/activity-logger";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { applyRateLimit } from "@/lib/rate-limit";

const ProductUpdateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  category: z.string().min(1).max(100).optional(),
  price: z.number().positive().optional(),
  costPrice: z.number().min(0).optional().nullable(),
  // FIX 2026-05: bumped 500 → 500_000 para soportar dataURL WebP comprimida.
  // El processImage() del cliente garantiza ≤120KB (~160_000 chars base64).
  // 500K da margen para imágenes grandes pegadas como URL externa también.
  image: z.string().max(500_000).optional(),
  unit: z.string().max(20).optional(),
  badge: z.string().max(50).optional().nullable(),
  barcode: z.string().max(100).optional().nullable(),
  stock: z.number().min(0).optional().nullable(),
  stockMin: z.number().min(0).optional().nullable(),
  stockMax: z.number().min(0).optional().nullable(),
  active: z.boolean().optional(),
  expiryDate: z.string().optional().nullable(),
  // FIX 2026-05: faltaba el campo description aunque la UI lo expone y la
  // generación AI lo llena. Sin esto los cambios al description se perdían
  // silenciosamente al guardar.
  description: z.string().max(2000).optional().nullable(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { id } = await ctx.params;
    const product = await ProductsDB.getById(tenantId, Number(id));
    if (!product) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(product);
  } catch (e) {
    logger.error("[products/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

async function handleUpdate(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const numId = Number(id);
    const existing = await ProductsDB.getById(auth.tenantId, numId);
    if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const raw = await req.json();
    const parsed = ProductUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const updated = await ProductsDB.upsert({
      ...existing,
      ...body,
      id: numId,
      costPrice: body.costPrice ?? existing.costPrice,
      badge: body.badge ?? existing.badge,
      barcode: body.barcode ?? existing.barcode,
      stock: body.stock ?? existing.stock,
      stockMin: body.stockMin ?? existing.stockMin,
      stockMax: body.stockMax ?? existing.stockMax,
      description: body.description ?? existing.description,
    });

    // Record price history when price actually changed
    if (body.price != null && body.price !== existing.price) {
      await PriceHistoryDB.record(numId, existing.price, body.price, auth.tenantId).catch((err) => logger.error("[products/id] PriceHistoryDB.record failed", { error: String(err) }));
    }

    const requestId = req.headers.get("x-request-id") ?? undefined;
    logActivity(
      "Editar",
      "producto",
      `Producto actualizado: ${updated.name} (S/${updated.price})`,
      String(updated.id),
      "admin",
      requestId,
    ).catch((err) => logger.error("[products/id] logActivity update failed", { error: String(err) }));
    invalidate(`dashboard:${auth.tenantId}`);
    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[products/id] PUT/PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export const PUT = handleUpdate;
export const PATCH = handleUpdate;

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const _rl = await applyRateLimit(req, "MODERATE", "products-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const numId = Number(id);
    const existing = await ProductsDB.getById(auth.tenantId, numId);
    if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    await ProductsDB.delete(auth.tenantId, numId);
    const requestId = req.headers.get("x-request-id") ?? undefined;
    logActivity("Eliminar", "producto", `Producto eliminado: ${existing.name}`, String(numId), "admin", requestId).catch((err) => logger.error("[products/id] logActivity delete failed", { error: String(err) }));
    invalidate(`dashboard:${auth.tenantId}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[products/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
