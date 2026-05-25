import { NextRequest, NextResponse } from "next/server";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

// GET /api/adelantos/resumen — KPIs del módulo
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const resumen = await AdelantosDB.resumen(auth.tenantId);
    return NextResponse.json(resumen, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (e) {
    logger.error("[adelantos/resumen] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
