import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { ImageBankDB } from "@/lib/db/image-bank.db";
import { logger } from "@/lib/logger";

/**
 * POST /api/superadmin/image-bank/[categoryId]/items
 *   Agrega un nuevo item (con imagen) a la categoría.
 */

const isSafeImageUrl = (s: string): boolean => {
  if (s.startsWith("/uploads/") || s.startsWith("/brand/") || s.startsWith("/images/")) return true;
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
};

const CreateItemSchema = z.object({
  name: z.string().min(1).max(120),
  imageUrl: z
    .string()
    .min(1)
    .refine(isSafeImageUrl, { message: "imageUrl debe ser HTTPS público o un path /uploads/" }),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ categoryId: string }> }) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const { categoryId } = await ctx.params;
  const body = await req.json().catch((err) => { logger.warn("[image-bank items POST] body parse fail", { err: String(err) }); return null; });
  const parsed = CreateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const item = await ImageBankDB.addItem(categoryId, parsed.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    logger.error("[image-bank items POST] error", { err: msg });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
