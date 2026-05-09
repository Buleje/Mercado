import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { RecetasDB } from "@/lib/db/recetas.db";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

const ProduceSchema = z.object({
  quantity: z.number().int().min(1).max(1000),
  notas: z.string().max(1000).optional(),
});

/**
 * POST /api/recetas/[id]/produce
 *
 * Records a production run for a recipe. Thin wrapper over
 * RecetasDB.recordProduction which handles the whole transactional
 * flow (deduct ingredients, emit InventoryMovements, increment output,
 * cache invalidation).
 *
 * Body: { quantity: int 1..1000, notas?: string }
 *
 * Auth: admin | cajero.
 * Rate limit: MODERATE.
 *
 * Mirrors the legacy POST /api/recetas/[id]/producir endpoint but exposes
 * the English contract name defined in CONTRACTS/ola-2.md (item #13).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = applyRateLimit(req, "MODERATE", "recipe-produce");
  if (rateLimited) return rateLimited;

  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = ProduceSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Datos inválidos",
          issues: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 },
      );
    }

    const result = await RecetasDB.recordProduction(
      auth.tenantId,
      id,
      parsed.data.quantity,
      auth.username,
      parsed.data.notas,
    );

    logActivity(
      "Producir",
      "receta",
      `Producción x${parsed.data.quantity} — costo real: S/${result.costoReal.toFixed(2)}`,
      result.produccionLoteId,
      auth.username,
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Client-visible domain errors
    if (
      msg.includes("Stock insuficiente") ||
      msg.includes("no encontrad") ||
      msg.includes("desactivada") ||
      msg.includes("Cantidad inválida")
    ) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    logger.error("[recetas/id/produce] POST error", { err: msg });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
