import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";

/**
 * POST /api/admin/documents/[id]/restore — restaura un documento de la papelera
 * (soft-deleted → activo). Contraparte del DELETE (soft) del [id]/route.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:restore");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const ok = await DocumentsDB.restore(auth.tenantId, id);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

    DocumentsDB.log(auth.tenantId, {
      documentId: id,
      actorId: auth.username,
      action: "restore",
    }).catch((err) => logger.warn("documents.audit.restore_fail", { err: String(err) }));

    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[documents.restore] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
