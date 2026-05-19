import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AlertsDB } from "@/lib/db/alerts.db";

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
  const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const payload = await AlertsDB.getSummary(auth.tenantId);
  return NextResponse.json(payload);
}
