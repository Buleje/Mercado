import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { CATEGORY_MULTIPLIERS } from "@/lib/loyalty/category-multiplier";
import { logger } from "@/lib/logger";

/**
 * GET /api/loyalty/category-multipliers
 * Returns the active category point multipliers for the loyalty program.
 * Used by the admin panel to display the multiplier config.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    return NextResponse.json({
      data: CATEGORY_MULTIPLIERS,
      defaultMultiplier: 1.0,
      description:
        "Multiplicadores de puntos por categoría. Frescos ×2 para incentivar compras de productos perecederos.",
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
