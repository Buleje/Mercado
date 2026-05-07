import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { VariantCatalogDb } from "@/lib/db/variant-catalog.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// Whitelist de protocolos para imageUrl — bloquea SSRF (file://, internal IPs).
// Aceptamos:
//  - HTTPS público (CDN del marketplace, Supabase Storage, etc.)
//  - Paths relativos same-origin (/uploads/..., /brand/...) que vienen del
//    endpoint /api/superadmin/upload con fallback FS local en dev.
const isSafeImageUrl = (s: string): boolean => {
  if (s.startsWith("/uploads/") || s.startsWith("/brand/") || s.startsWith("/images/")) {
    return true;
  }
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
};

const OptionSchema = z.object({
  name: z.string().min(1).max(120),
  imageUrl: z
    .string()
    .refine((s) => s.startsWith("/") || /^https?:\/\//.test(s), { message: "URL inválida" })
    .refine(isSafeImageUrl, { message: "imageUrl debe ser HTTPS público o un path /uploads/" })
    .nullable()
    .optional(),
  priceDelta: z.number().min(-10000).max(10000).optional(),
  position: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-variant-catalog-X-options"); if (_rl) return _rl;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const body = await req.json().catch((err) => {
    logger.warn("[superadmin/variant-catalog/id/options] body parse fail", { error: String(err) });
    return null;
  });
  const parsed = OptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const option = await VariantCatalogDb.createOption(id, parsed.data);
    logger.info("variant-catalog.option.create", {
      actor: auth.username,
      templateId: id,
      optionId: option.id,
      name: option.name,
    });
    return NextResponse.json({ option }, { status: 201 });
  } catch (error) {
    logger.error("variant-catalog.option.create.failed", { templateId: id, error: String(error) });
    return NextResponse.json({ error: "No se pudo crear" }, { status: 500 });
  }
}
