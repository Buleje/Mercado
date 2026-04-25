/**
 * POST /api/admin/modifier-groups/[groupId]/options — crea opcion nueva
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ProductModifiersDB } from "@/lib/db/product-modifiers.db";
import { logger } from "@/lib/logger";

const CreateOptionSchema = z.object({
  name: z.string().min(1).max(120),
  priceDelta: z.number().min(-9999).max(99999).optional(),
  position: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  imageUrl: z
    .union([z.string().url(), z.literal(""), z.null()])
    .optional(),
});

export const POST = withApiHandler(
  "admin-modifier-options-create",
  async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const rl = applyRateLimit(req, "GENEROUS", "modifier-options-create");
    if (rl) return rl;

    const params = await ctx.params;
    const groupId = params.groupId;
    if (!groupId) {
      return NextResponse.json({ error: "groupId invalido" }, { status: 400 });
    }

    const raw = await req.json().catch((err) => {
      logger.warn("[modifier-option] invalid json", { error: String(err) });
      return null;
    });
    const parsed = CreateOptionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    try {
      const option = await ProductModifiersDB.upsertOption(auth.tenantId, {
        groupId,
        ...parsed.data,
        imageUrl:
          parsed.data.imageUrl === "" ? null : parsed.data.imageUrl ?? null,
      });
      return NextResponse.json(option, { status: 201 });
    } catch (err) {
      logger.warn("[modifier-option] create failed", { error: String(err) });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Error" },
        { status: 400 },
      );
    }
  },
);
