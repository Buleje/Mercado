import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { buildLothWorkbook } from "@/lib/forestal/loth-export";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";

/**
 * /api/admin/forestal/loth/export — descarga del Libro LO-TH en Excel (.xlsx),
 * formato oficial SERFOR (ADR-125). Guard: spec:forestal:loth-libro.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const enabled = await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro");
  if (!enabled) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

  try {
    const [{ entries }, caratula] = await Promise.all([
      ForestLothDB.list(auth.tenantId, { includeAnnulled: true, limit: 500 }),
      ForestLothDB.getActiveCaratula(auth.tenantId),
    ]);
    const generatedAtISO = new Date().toISOString();
    const buffer = await buildLothWorkbook({
      caratula: caratula as Record<string, unknown> | null,
      entries: entries as unknown as Record<string, unknown>[],
      generatedAtISO,
    });
    const stamp = generatedAtISO.slice(0, 10);
    const filename = `libro-loth-${stamp}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("[loth.export] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
