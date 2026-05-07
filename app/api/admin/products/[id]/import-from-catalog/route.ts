import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { VariantCatalogDb } from "@/lib/db/variant-catalog.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const BodySchema = z.object({
  templateId: z.string().min(1),
  // Si se pasa optionIds, solo se importan esas opciones (modo selectivo).
  // Si está vacío/ausente, se importan todas las opciones del template.
  optionIds: z.array(z.string()).optional(),
});

/**
 * POST /api/admin/products/[id]/import-from-catalog
 * Body: { templateId }
 *
 * Clona el VariantCatalogTemplate (+ options) del catálogo global a las
 * tablas del tenant: ProductModifierGroup + ProductModifierOption.
 * Es una COPIA — el tenant puede editar precios/imágenes después sin
 * afectar el catálogo global.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-products-X-import-from-catalog"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const productId = parseInt(id, 10);
  if (!Number.isFinite(productId)) {
    return NextResponse.json({ error: "productId inválido" }, { status: 400 });
  }

  const body = await req.json().catch((err) => {
    logger.warn("[admin/import-from-catalog] body parse fail", { error: String(err) });
    return null;
  });
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await VariantCatalogDb.importToProduct(
      auth.tenantId,
      productId,
      parsed.data.templateId,
      parsed.data.optionIds && parsed.data.optionIds.length > 0 ? parsed.data.optionIds : undefined,
    );
    // 200 si ya existía (idempotente — admin spamea botón sin duplicar),
    // 201 si recién creado.
    return NextResponse.json(
      { ok: true, ...result },
      { status: result.alreadyExists ? 200 : 201 },
    );
  } catch (error) {
    logger.error("admin.variant-catalog.import.failed", {
      tenantId: auth.tenantId,
      productId,
      templateId: parsed.data.templateId,
      error: String(error),
    });
    const msg = error instanceof Error ? error.message : "Error";
    if (msg.includes("no encontrado") || msg.includes("no pertenece")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: "No se pudo importar" }, { status: 500 });
  }
}
