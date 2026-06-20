import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { getSuperadminAuditLog } from "@/lib/db/superadmin-audit-log.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/audit-log — registro de acciones del superadmin
 * (Brandon 2026-06-19): impersonaciones y acciones sensibles, quién y cuándo.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ ...(await getSuperadminAuditLog()), generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.error("[superadmin/audit-log] GET", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
