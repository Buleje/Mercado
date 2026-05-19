/**
 * PATCH  /api/admin/modifier-options/[optionId] — update opcion
 * DELETE /api/admin/modifier-options/[optionId] — borra opcion
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { ProductModifiersDB } from "@/lib/db/product-modifiers.db";
import { logger } from "@/lib/logger";

const UpdateOptionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  priceDelta: z.number().min(-9999).max(99999).optional(),
  position: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  imageUrl: z
    .union([z.string().url(), z.literal(""), z.null()])
    .optional(),
});

export const PATCH = withApiHandler(
  "admin-modifier-option-patch",
  async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const rl = applyRateLimit(req, "GENEROUS", "modifier-option-patch");
    if (rl) return rl;

    const params = await ctx.params;
    const optionId = params.optionId;
    if (!optionId) {
      return NextResponse.json({ error: "optionId invalido" }, { status: 400 });
    }

    const raw = await req.json().catch((err) => {
      logger.warn("[modifier-option] invalid json", { error: String(err) });
      return null;
    });
    const parsed = UpdateOptionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    // Cargamos opcion actual con groupId para hacer upsert merged
    const current = await ProductModifiersDB.getOptionById(
      auth.tenantId,
      optionId,
    );
    if (!current) {
      return NextResponse.json({ error: "Opcion no encontrada" }, { status: 404 });
    }

    try {
      const option = await ProductModifiersDB.upsertOption(auth.tenantId, {
        id: optionId,
        groupId: current.groupId,
        name: parsed.data.name ?? current.name,
        priceDelta:
          parsed.data.priceDelta ?? current.priceDelta,
        position: parsed.data.position ?? current.position,
        isDefault: parsed.data.isDefault ?? current.isDefault,
        isActive: parsed.data.isActive ?? current.isActive,
        imageUrl:
          parsed.data.imageUrl === ""
            ? null
            : parsed.data.imageUrl !== undefined
              ? parsed.data.imageUrl
              : current.imageUrl,
      });
      return NextResponse.json(option);
    } catch (err) {
      logger.warn("[modifier-option] patch failed", { error: String(err) });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Error" },
        { status: 400 },
      );
    }
  },
);

export const DELETE = withApiHandler(
  "admin-modifier-option-delete",
  async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const rl = applyRateLimit(req, "GENEROUS", "modifier-option-delete");
    if (rl) return rl;

    const params = await ctx.params;
    const optionId = params.optionId;
    if (!optionId) {
      return NextResponse.json({ error: "optionId invalido" }, { status: 400 });
    }

    try {
      await ProductModifiersDB.deleteOption(auth.tenantId, optionId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      logger.warn("[modifier-option] delete failed", { error: String(err) });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Error" },
        { status: 400 },
      );
    }
  },
);
