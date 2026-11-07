import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { ensureSystemTemplatesSeeded } from "@/lib/documents/templates-seed";
import { logger } from "@/lib/logger";
import { SUPERADMIN_DOCS_TENANT } from "@/lib/documents/superadmin-vault";


export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "sa-documents:templates:list");
    if (rl) return rl;
    const auth = await requirePlatformAPI(req);
    if (auth instanceof NextResponse) return auth;

    await ensureSystemTemplatesSeeded();
    const templates = await DocumentsDB.listTemplates(SUPERADMIN_DOCS_TENANT);
    return NextResponse.json({ templates });

  } catch (e) {
    logger.error("[sa-documents/templates/get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
