/**
 * POST /api/admin/modifier-groups/[groupId]/options/reorder
 * body: { ids: string[] }
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ProductModifiersDB } from "@/lib/db/product-modifiers.db";
import { logger } from "@/lib/logger";

const Schema = z.object({ ids: z.array(z.string()).max(50) });

export const POST = withApiHandler(
  "admin-modifier-options-reorder",
  async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const rl = applyRateLimit(req, "GENEROUS", "modifier-options-reorder");
    if (rl) return rl;

    const params = await ctx.params;
    const groupId = params.groupId;
    if (!groupId) return NextResponse.json({ error: "groupId invalido" }, { status: 400 });

    const raw = await req.json().catch((err) => {
      logger.warn("[reorder-options] invalid json", { error: String(err) });
      return null;
    });
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }

    try {
      await ProductModifiersDB.reorderOptions(auth.tenantId, groupId, parsed.data.ids);
      return NextResponse.json({ ok: true });
    } catch (err) {
      logger.warn("[reorder-options] failed", { error: String(err) });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Error" },
        { status: 400 },
      );
    }
  },
);
