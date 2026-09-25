import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { assertCsrf } from "@/lib/auth/csrf";
import { isPrivilegedRole } from "@/lib/documents/doc-access";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Corta un enlace publico. `?kind=folder` para los de carpeta; por defecto,
 * los de documento. Revocar es irreversible por diseño: el token queda muerto
 * y hay que generar uno nuevo para volver a compartir.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:shares:revoke");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    if (!isPrivilegedRole(auth.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { id } = await ctx.params;
    const kind = req.nextUrl.searchParams.get("kind") === "folder" ? "folder" : "doc";

    const ok =
      kind === "folder"
        ? await DocumentsDB.revokeFolderShare(auth.tenantId, id)
        : await DocumentsDB.revokeShare(auth.tenantId, id);

    if (!ok) {
      return NextResponse.json({ error: "not_found_or_already_revoked" }, { status: 404 });
    }

    DocumentsDB.log(auth.tenantId, {
      documentId: "",
      actorId: auth.username,
      action: "share_revoke",
      metadata: { shareId: id, kind },
    }).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));

    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[documents.shares.delete] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
