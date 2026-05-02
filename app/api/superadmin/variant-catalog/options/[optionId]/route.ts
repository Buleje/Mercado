import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { VariantCatalogDb } from "@/lib/db/variant-catalog.db";
import { logger } from "@/lib/logger";

// SSRF guard: solo HTTPS público (no file://, http internal, etc.)
const isSafeImageUrl = (s: string): boolean => {
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
};

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  imageUrl: z
    .string()
    .url()
    .refine(isSafeImageUrl, { message: "imageUrl debe ser HTTPS público" })
    .nullable()
    .optional(),
  priceDelta: z.number().min(-10000).max(10000).optional(),
  position: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ optionId: string }> }) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { optionId } = await ctx.params;
  const body = await req.json().catch((err) => {
    logger.warn("[superadmin/variant-catalog/options/id] body parse fail", { error: String(err) });
    return null;
  });
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const option = await VariantCatalogDb.updateOption(optionId, parsed.data);
    logger.info("variant-catalog.option.update", {
      actor: auth.username,
      optionId,
      patchKeys: Object.keys(parsed.data),
    });
    return NextResponse.json({ option });
  } catch (error) {
    logger.error("variant-catalog.option.update.failed", { optionId, error: String(error) });
    return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ optionId: string }> }) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { optionId } = await ctx.params;
  try {
    await VariantCatalogDb.deleteOption(optionId);
    logger.info("variant-catalog.option.delete", { actor: auth.username, optionId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("variant-catalog.option.delete.failed", { optionId, error: String(error) });
    return NextResponse.json({ error: "No se pudo borrar" }, { status: 500 });
  }
}
