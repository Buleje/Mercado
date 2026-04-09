import { NextRequest, NextResponse } from "next/server";
import { PrestamosDB } from "@/lib/db/prestamos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

// GET /api/prestamos/resumen — portfolio summary for dashboard widgets
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const resumen = await PrestamosDB.getResumen(auth.tenantId);
    return NextResponse.json(resumen);
  } catch (e) {
    logger.error("[prestamos/resumen] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
