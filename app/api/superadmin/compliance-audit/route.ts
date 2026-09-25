import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { getComplianceAudit } from "@/lib/db/compliance-audit.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/compliance-audit — registro de auditoría Ley 29733
 * (Brandon 2026-06-19): accesos a datos personales (ActivityLog [L29733]).
 */
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const data = await getComplianceAudit();
    return NextResponse.json({ ...data, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.error("[superadmin/compliance-audit] GET", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
