import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { logger } from "@/lib/logger";
import { SUPERADMIN_DOCS_TENANT } from "@/lib/documents/superadmin-vault";

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  parentId: z.string().nullable().optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(40).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "sa-documents:folders:list");
    if (rl) return rl;
    const auth = await requirePlatformAPI(req);
    if (auth instanceof NextResponse) return auth;

    const folders = await DocumentsDB.listFolders(SUPERADMIN_DOCS_TENANT);
    return NextResponse.json({ folders });

  } catch (e) {
    logger.error("[sa-documents/folders/get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "sa-documents:folders:create");
    if (rl) return rl;
    if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
    const auth = await requirePlatformAPI(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = CreateBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    const folder = await DocumentsDB.createFolder(SUPERADMIN_DOCS_TENANT, parsed.data);
    return NextResponse.json({ folder });

  } catch (e) {
    logger.error("[sa-documents/folders/post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
