import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/documents/activity — feed de actividad global del drive
 * (audit log cross-documento, más reciente primero). ?limit= (máx 200).
 */
export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:activity");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "40");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 40;
    const activity = await DocumentsDB.recentActivity(auth.tenantId, limit);
    return NextResponse.json({ activity });
  } catch (e) {
    logger.error("[documents.activity] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
