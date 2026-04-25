/**
 * GET  /api/admin/products/[id]/modifier-groups — list grupos del producto
 * POST /api/admin/products/[id]/modifier-groups — crea grupo nuevo
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ProductModifiersDB } from "@/lib/db/product-modifiers.db";
import { logger } from "@/lib/logger";

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  required: z.boolean().optional(),
  minSelect: z.number().int().min(0).max(20).optional(),
  maxSelect: z.number().int().min(1).max(20).optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const GET = withApiHandler(
  "admin-modifier-groups-list",
  async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const rl = applyRateLimit(req, "GENEROUS", "modifier-groups-list");
    if (rl) return rl;

    const params = await ctx.params;
    const productId = parseInt(params.id ?? "0", 10);
    if (!productId) {
      return NextResponse.json({ error: "Product id invalido" }, { status: 400 });
    }

    const groups = await ProductModifiersDB.listForProductAdmin(
      auth.tenantId,
      productId,
    );
    return NextResponse.json({ groups });
  },
);

export const POST = withApiHandler(
  "admin-modifier-groups-create",
  async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const rl = applyRateLimit(req, "GENEROUS", "modifier-groups-create");
    if (rl) return rl;

    const params = await ctx.params;
    const productId = parseInt(params.id ?? "0", 10);
    if (!productId) {
      return NextResponse.json({ error: "Product id invalido" }, { status: 400 });
    }

    const raw = await req.json().catch((err) => {
      logger.warn("[modifier-groups] invalid json", { error: String(err) });
      return null;
    });
    const parsed = CreateGroupSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Datos invalidos",
          issues: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 },
      );
    }

    try {
      const group = await ProductModifiersDB.upsertGroup(auth.tenantId, {
        productId,
        ...parsed.data,
      });
      return NextResponse.json(group, { status: 201 });
    } catch (err) {
      logger.warn("[modifier-groups] create failed", { error: String(err) });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Error" },
        { status: 400 },
      );
    }
  },
);
