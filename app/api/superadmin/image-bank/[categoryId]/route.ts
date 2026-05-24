import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { ImageBankDB } from "@/lib/db/image-bank.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";

/**
 * PATCH /api/superadmin/image-bank/[categoryId]
 *   Actualiza nombre/descripción de una categoría.
 *
 * DELETE /api/superadmin/image-bank/[categoryId]
 *   Elimina la categoría (cascada items).
 */

const PatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(200).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ categoryId: string }> }) {
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-image-bank-X"); if (_rl) return _rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const { categoryId } = await ctx.params;
  const body = await req.json().catch((err) => { logger.warn("[image-bank PATCH] body parse fail", { err: String(err) }); return null; });
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const category = await ImageBankDB.updateCategory(categoryId, parsed.data);
    return NextResponse.json({ category });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    logger.error("[image-bank PATCH] error", { err: msg });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ categoryId: string }> }) {
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-image-bank-X"); if (_rl) return _rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const { categoryId } = await ctx.params;
  try {
    await ImageBankDB.deleteCategory(categoryId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
