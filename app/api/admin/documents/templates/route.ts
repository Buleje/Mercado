import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { ensureSystemTemplatesSeeded } from "@/lib/documents/templates-seed";
import { logger } from "@/lib/logger";


export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:templates:list");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    await ensureSystemTemplatesSeeded();
    const templates = await DocumentsDB.listTemplates(auth.tenantId);
    return NextResponse.json({ templates });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
