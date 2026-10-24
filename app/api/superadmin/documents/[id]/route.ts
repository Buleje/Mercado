import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { getSignedUrl, deleteFromStorage } from "@/lib/documents/storage";
import { SUPERADMIN_DOCS_TENANT } from "@/lib/documents/superadmin-vault";

const PatchBody = z.object({
  name: z.string().min(1).max(255).optional(),
  category: z.string().max(40).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  favorite: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
  restore: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/** GET → URL firmada para descargar/visualizar el documento. */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "sa-documents:get");
    if (rl) return rl;
    const auth = await requirePlatformAPI(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(SUPERADMIN_DOCS_TENANT, id);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // preview=1 → thumbnail inline en la vista grid (NO cuenta como "view" en el audit).
    // download=1 → fuerza Content-Disposition: attachment con el nombre del documento.
    const preview = req.nextUrl.searchParams.get("preview") === "1";
    const forceDownload = req.nextUrl.searchParams.get("download") === "1";
    const signedUrl = await getSignedUrl(
      doc.storagePath,
      undefined,
      forceDownload ? { download: doc.name } : undefined,
    );

    if (!preview) {
      DocumentsDB.log(SUPERADMIN_DOCS_TENANT, {
        documentId: id,
        actorId: auth.username,
        action: forceDownload ? "download" : "view",
      }).catch((err) => logger.warn("sa-documents.audit.view_fail", { err: String(err) }));
    }

    return NextResponse.json({ document: doc, signedUrl });
  } catch (e) {
    logger.error("[sa-documents/get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** PATCH → editar metadata (nombre, categoría, tags, favorito, vencimiento). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "sa-documents:patch");
    if (rl) return rl;
    if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
    const auth = await requirePlatformAPI(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const parsed = PatchBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_body", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Restaurar desde la papelera (deletedAt → null). Va antes del getById,
    // que excluye soft-deleted.
    if (parsed.data.restore) {
      const ok = await DocumentsDB.restore(SUPERADMIN_DOCS_TENANT, id);
      if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
      DocumentsDB.log(SUPERADMIN_DOCS_TENANT, {
        documentId: id,
        actorId: auth.username,
        action: "restore",
      }).catch((err) => logger.warn("sa-documents.audit.restore_fail", { err: String(err) }));
      const restored = await DocumentsDB.getById(SUPERADMIN_DOCS_TENANT, id);
      return NextResponse.json({ document: restored });
    }

    const before = await DocumentsDB.getById(SUPERADMIN_DOCS_TENANT, id);
    if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const expiresAtDate =
      parsed.data.expiresAt === undefined
        ? undefined
        : parsed.data.expiresAt === null
          ? null
          : new Date(parsed.data.expiresAt);

    const updated = await DocumentsDB.update(SUPERADMIN_DOCS_TENANT, id, {
      name: parsed.data.name,
      category: parsed.data.category,
      tags: parsed.data.tags,
      favorite: parsed.data.favorite,
      expiresAt: expiresAtDate,
    });
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ document: updated });
  } catch (e) {
    logger.error("[sa-documents/patch] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** DELETE → soft-delete (o `?purge=1` para borrar también del storage). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "sa-documents:delete");
    if (rl) return rl;
    if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
    const auth = await requirePlatformAPI(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const purge = req.nextUrl.searchParams.get("purge") === "1";

    const doc = await DocumentsDB.getByIdIncludingDeleted(SUPERADMIN_DOCS_TENANT, id);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (purge) {
      const paths = [
        doc.storagePath,
        ...(await DocumentsDB.listVersionPaths(SUPERADMIN_DOCS_TENANT, id)),
      ];
      await deleteFromStorage(paths).catch((e) =>
        logger.warn("sa-documents.storage_cleanup_fail", { e: String(e) }),
      );
      await DocumentsDB.hardDelete(SUPERADMIN_DOCS_TENANT, id);
      return NextResponse.json({ ok: true, purged: true });
    }

    const ok = await DocumentsDB.softDelete(SUPERADMIN_DOCS_TENANT, id);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

    DocumentsDB.log(SUPERADMIN_DOCS_TENANT, {
      documentId: id,
      actorId: auth.username,
      action: "delete",
    }).catch((err) => logger.warn("sa-documents.audit.delete_fail", { err: String(err) }));

    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[sa-documents/delete] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
