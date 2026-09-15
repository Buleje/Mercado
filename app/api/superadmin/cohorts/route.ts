import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { getCohortRetention } from "@/lib/db/cohorts.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/cohorts — retención por cohorte de alta (Brandon
 * 2026-06-19): % de negocios que sigue activo mes a mes desde su alta.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const data = await getCohortRetention();
    return NextResponse.json({ ...data, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.error("[superadmin/cohorts] GET", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
