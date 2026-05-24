import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { VariantCatalogDb } from "@/lib/db/variant-catalog.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";

const PatchSchema = z
  .object({
    category: z.string().min(1).max(60).optional(),
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    required: z.boolean().optional(),
    minSelect: z.number().int().min(0).max(20).optional(),
    maxSelect: z.number().int().min(1).max(20).optional(),
    position: z.number().int().min(0).optional(),
    isPublished: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.minSelect === undefined ||
      d.maxSelect === undefined ||
      d.minSelect <= d.maxSelect,
    {
      message: "minSelect no puede ser mayor que maxSelect",
      path: ["minSelect"],
    },
  );

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const template = await VariantCatalogDb.getTemplate(id);
  if (!template) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ template });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-variant-catalog-X"); if (_rl) return _rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const body = await req.json().catch((err) => {
    logger.warn("[superadmin/variant-catalog/id] body parse fail", { error: String(err) });
    return null;
  });
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const template = await VariantCatalogDb.updateTemplate(id, parsed.data);
    logger.info("variant-catalog.update", {
      actor: auth.username,
      templateId: id,
      patchKeys: Object.keys(parsed.data),
    });
    return NextResponse.json({ template });
  } catch (error) {
    logger.error("variant-catalog.update.failed", { id, error: String(error) });
    return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-variant-catalog-X"); if (_rl) return _rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  try {
    await VariantCatalogDb.deleteTemplate(id);
    logger.info("variant-catalog.delete", { actor: auth.username, templateId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("variant-catalog.delete.failed", { id, error: String(error) });
    return NextResponse.json({ error: "No se pudo borrar" }, { status: 500 });
  }
}
