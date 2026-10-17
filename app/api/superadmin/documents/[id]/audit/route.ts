import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { logger } from "@/lib/logger";
import { SUPERADMIN_DOCS_TENANT } from "@/lib/documents/superadmin-vault";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "sa-documents:audit");
    if (rl) return rl;
    const auth = await requirePlatformAPI(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const logs = await DocumentsDB.listAudit(SUPERADMIN_DOCS_TENANT, id, 200);
    return NextResponse.json({ logs });

  } catch (e) {
    logger.error("[sa-documents/audit/get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
