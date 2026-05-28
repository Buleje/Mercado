import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/forestal/wood-entries/aggregate
 *
 * Agregados de volumen por especie (dashboard CTP).
 *
 * Query params opcionales:
 *   from=YYYY-MM-DD
 *   to=YYYY-MM-DD
 *
 * Response:
 *   { aggregates: [{ species, totalVolumeM3, totalPieces, entryCount }] }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "STRICT");
  if (rl) return rl;

  const ok = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
  if (!ok) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  try {
    const aggregates = await WoodEntriesDB.aggregateBySpecies(auth.tenantId, {
      fromDate: from ? new Date(from) : undefined,
      toDate: to ? new Date(to) : undefined,
    });

    // Sumar totales generales (útil para KPIs del header)
    const grandTotal = aggregates.reduce(
      (acc, a) => ({
        volume: acc.volume + a.totalVolumeM3,
        pieces: acc.pieces + a.totalPieces,
        entries: acc.entries + a.entryCount,
      }),
      { volume: 0, pieces: 0, entries: 0 },
    );

    return NextResponse.json({
      aggregates,
      grandTotal,
      species_count: aggregates.length,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("[wood-entries.aggregate] failed", { error: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
