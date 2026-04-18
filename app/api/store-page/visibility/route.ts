import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { StorePageDB } from "@/lib/db/store-page.db";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";

/**
 * PATCH /api/store-page/visibility
 *
 * Bulk update de visibilidad en la tienda individual. Upsert de overrides
 * con `visible` flag. Idempotente.
 *
 * Body: { productIds: number[], visible: boolean }
 * Auth: requireAdmin(["admin"]).
 * Invalida caché tras write.
 */

const PatchSchema = z.object({
  productIds: z.array(z.number().int().positive()).min(1).max(500),
  visible: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch (err) {
    logger.warn("[store-page/visibility] invalid json body", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const result = await withDbRetry(() =>
      StorePageDB.setBulkVisibility(
        auth.tenantId,
        parsed.data.productIds,
        parsed.data.visible,
      ),
    );
    logger.info("[store-page/visibility] bulk update", {
      tenantId: auth.tenantId,
      count: parsed.data.productIds.length,
      visible: parsed.data.visible,
      ...result,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const err = e as Error;
    logger.error("[store-page/visibility] PATCH error", { err: err.message });
    return NextResponse.json(
      { error: "Error al actualizar visibilidad" },
      { status: 503 },
    );
  }
}
