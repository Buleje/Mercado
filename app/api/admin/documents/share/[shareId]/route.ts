import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { assertCsrf } from "@/lib/auth/csrf";


type Ctx = { params: Promise<{ shareId: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "MODERATE", "documents:share:revoke");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { shareId } = await ctx.params;
  const ok = await DocumentsDB.revokeShare(auth.tenantId, shareId);
  if (!ok) return NextResponse.json({ error: "not_found_or_already_revoked" }, { status: 404 });

  DocumentsDB.log(auth.tenantId, {
    documentId: "", // share-scoped, no doc context here
    actorId: auth.username,
    action: "share_revoke",
    metadata: { shareId },
  }).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));

  return NextResponse.json({ ok: true });
}
