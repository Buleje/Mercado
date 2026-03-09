import { NextRequest, NextResponse } from "next/server";
import { ProductsDB, PriceHistoryDB } from "@/lib/jsondb";
import type { DbProduct } from "@/lib/jsondb";
import { logActivity } from "@/lib/activity-logger";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const product = await ProductsDB.getById(Number(id));
  if (!product) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(product);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const existing = await ProductsDB.getById(Number(id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json() as Partial<DbProduct>;
  // Track price change
  if (body.price !== undefined && body.price !== existing.price) {
    await PriceHistoryDB.record(Number(id), existing.price, body.price);
  }
  const updated = await ProductsDB.upsert({ ...existing, ...body, id: Number(id) });
  await logActivity("Editar", "producto", `Producto editado: ${updated.name}`, String(id));
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const p = await ProductsDB.getById(Number(id));
  await ProductsDB.delete(Number(id));
  await logActivity("Eliminar", "producto", `Producto eliminado: ${p?.name ?? id}`, String(id));
  return NextResponse.json({ ok: true });
}
