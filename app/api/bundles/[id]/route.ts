import { NextResponse } from "next/server";
import { BundlesDB } from "@/lib/jsondb";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json();
  const updated = await BundlesDB.update(id, body);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  await BundlesDB.delete(id);
  return NextResponse.json({ ok: true });
}
