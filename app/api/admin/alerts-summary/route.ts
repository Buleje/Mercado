import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AlertsDB } from "@/lib/db/alerts.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/alerts-summary
 *
 * Resumen de alertas del tenant para el banner admin. Wrapper delgado sobre
 * AlertsDB.getSummary — toda la lógica (5 queries Promise.all + cache 60s)
 * vive en lib/db/alerts.db.ts.
 *
 * Migrado 2026-05-19 desde prisma.* directo a AlertsDB (audit CI lint
 * P1: violaba no-restricted-properties multi-tenant rule).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const payload = await AlertsDB.getSummary(auth.tenantId);
    return NextResponse.json(payload);

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
