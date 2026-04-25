/**
 * POST /api/admin/products/[id]/modifier-groups/reorder
 * body: { ids: string[] }  — orden deseado de los grupos.
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
  "admin-modifier-groups-reorder",
  async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const rl = applyRateLimit(req, "GENEROUS", "modifier-groups-reorder");
    if (rl) return rl;

    const params = await ctx.params;
    const productId = parseInt(params.id ?? "0", 10);
    if (!productId) return NextResponse.json({ error: "Product id invalido" }, { status: 400 });

    const raw = await req.json().catch((err) => {
      logger.warn("[reorder-groups] invalid json", { error: String(err) });
      return null;
    });
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }

    try {
      await ProductModifiersDB.reorderGroups(auth.tenantId, productId, parsed.data.ids);
      return NextResponse.json({ ok: true });
    } catch (err) {
      logger.warn("[reorder-groups] failed", { error: String(err) });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Error" },
        { status: 400 },
      );
    }
  },
);
