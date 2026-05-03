import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { ImageBankDB } from "@/lib/db/image-bank.db";
import { logger } from "@/lib/logger";

const isSafeImageUrl = (s: string): boolean => {
  if (s.startsWith("/uploads/") || s.startsWith("/brand/") || s.startsWith("/images/")) return true;
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
};

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  imageUrl: z.string().min(1).refine(isSafeImageUrl).optional(),
});

type RouteCtx = { params: Promise<{ categoryId: string; itemId: string }> };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const { categoryId, itemId } = await ctx.params;
  const body = await req.json().catch((err) => { logger.warn("[image-bank items PATCH] body parse fail", { err: String(err) }); return null; });
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const item = await ImageBankDB.updateItem(categoryId, itemId, parsed.data);
    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const { categoryId, itemId } = await ctx.params;
  try {
    await ImageBankDB.deleteItem(categoryId, itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 400 });
  }
}
