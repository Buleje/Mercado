import { NextRequest, NextResponse } from "next/server";
import { TreasuryDB } from "@/lib/db/treasury.db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

// GET /api/treasury/resumen
export const GET = withApiHandler("treasury-resumen-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const resumen = await TreasuryDB.getResumen(auth.tenantId);
    return NextResponse.json(resumen);
  } catch (e) {
    logger.error("[treasury/resumen] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
});
