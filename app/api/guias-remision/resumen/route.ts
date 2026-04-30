import { NextRequest, NextResponse } from "next/server";
import { GuiasRemisionDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await GuiasRemisionDB.getResumen(auth.tenantId);
    return NextResponse.json(data);
  } catch (e) {
    logger.error("[guias-remision/resumen] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
