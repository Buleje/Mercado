import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { SUPERADMIN_DOCS_TENANT } from "@/lib/documents/superadmin-vault";

type Ctx = { params: Promise<{ shareId: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "sa-documents:share:revoke");
    if (rl) return rl;
    if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
    const auth = await requirePlatformAPI(req);
    if (auth instanceof NextResponse) return auth;

    const { shareId } = await ctx.params;
    const ok = await DocumentsDB.revokeShare(SUPERADMIN_DOCS_TENANT, shareId);
    if (!ok) return NextResponse.json({ error: "not_found_or_already_revoked" }, { status: 404 });

    DocumentsDB.log(SUPERADMIN_DOCS_TENANT, {
      documentId: "", // share-scoped, no doc context here
      actorId: auth.username,
      action: "share_revoke",
      metadata: { shareId },
    }).catch((err) => logger.warn("sa-documents.audit.fail", { err: String(err) }));

    return NextResponse.json({ ok: true });

  } catch (e) {
    logger.error("[sa-documents/share/delete] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
