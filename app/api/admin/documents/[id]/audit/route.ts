import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { logger } from "@/lib/logger";


type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_READ", "documents:audit");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    if (!(await DocumentsDB.puedeVer(auth.tenantId, id, auth.role, { incluirBorrados: true }))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const logs = await DocumentsDB.listAudit(auth.tenantId, id, 200, auth.role);
    return NextResponse.json({ logs });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
