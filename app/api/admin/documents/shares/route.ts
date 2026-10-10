import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { assertCsrf } from "@/lib/auth/csrf";
import { isPrivilegedRole } from "@/lib/documents/doc-access";

/**
 * Centro de enlaces compartidos: lista TODOS los enlaces publicos vivos del
 * tenant (documentos + carpetas) y permite cortarlos de una. Solo para roles
 * privilegiados: ver los tokens equivale a ver los archivos.
 */
export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_READ", "documents:shares:list");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    if (!isPrivilegedRole(auth.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const links = await DocumentsDB.listTenantShares(auth.tenantId);
    return NextResponse.json({ links });
  } catch (e) {
    logger.error("[documents.shares.get] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Revoca de una vez todos los enlaces vivos del tenant. */
export async function DELETE(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:shares:revoke-all");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    if (!isPrivilegedRole(auth.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const revoked = await DocumentsDB.revokeAllShares(auth.tenantId);

    DocumentsDB.log(auth.tenantId, {
      documentId: "",
      actorId: auth.username,
      action: "share_revoke",
      metadata: { scope: "all", revoked },
    }).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));

    return NextResponse.json({ ok: true, revoked });
  } catch (e) {
    logger.error("[documents.shares.delete-all] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
