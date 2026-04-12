import { NextRequest, NextResponse } from "next/server";
import { RecetasDB } from "@/lib/db/recetas.db";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * GET /api/recetas/[id]/cost-breakdown
 *
 * Returns the RecetaCostBreakdown contract (lib/types/recetas.ts).
 * Used by the admin Recetas module to render cost + margin analysis.
 *
 * Auth: admin | cajero.
 * Rate limit: MODERATE.
 * Cache: 60s per (tenantId, recetaId). Invalidated on recordProduction.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = applyRateLimit(req, "MODERATE", "recipe-cost-breakdown");
  if (rateLimited) return rateLimited;

  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const breakdown = await RecetasDB.getCostBreakdown(auth.tenantId, id);
    if (!breakdown) {
      return NextResponse.json(
        { error: "Receta no encontrada" },
        { status: 404 },
      );
    }
    return NextResponse.json(breakdown);
  } catch (e) {
    logger.error("[recetas/id/cost-breakdown] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
