import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { AdminStatsDB } from "@/lib/db/admin-stats.db";

// Brandon 2026-05-16 (audit P1): getOrSet TTL 30s elimina 9 queries/polling.
// Cache hit >90%; invalidacion natural al expirar TTL.
// 2026-05-19: migrado a AdminStatsDB (regla #1 CLAUDE.md — audit project-wide).

/**
 * GET /api/admin/stats
 * Lightweight aggregate stats for the admin header / real-time widget.
 * Uses COUNT and SUM queries directly instead of loading full datasets.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;

  try {
    const payload = await getOrSet(`admin:stats:${tenantId}`, 30, () =>
      AdminStatsDB.getHeaderStats(tenantId)
    );

    return NextResponse.json(payload);
  } catch (e) {
    logger.error("[admin/stats] error", { error: (e as Error).message, tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
