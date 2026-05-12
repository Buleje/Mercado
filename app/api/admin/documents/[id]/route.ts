import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { getSignedUrl, deleteFromStorage } from "@/lib/documents/storage";
import { assertCsrf } from "@/lib/auth/csrf";


const PatchBody = z.object({
  name: z.string().min(1).max(255).optional(),
  folderId: z.string().nullable().optional(),
  category: z.string().max(40).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  favorite: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "MODERATE", "documents:get");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const doc = await DocumentsDB.getById(auth.tenantId, id);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const signedUrl = await getSignedUrl(doc.storagePath);

  DocumentsDB.log(auth.tenantId, {
    documentId: id,
    actorId: auth.username,
    action: "view",
  }).catch((err) => logger.warn("documents.audit.view_fail", { err: String(err) }));

  return NextResponse.json({ document: doc, signedUrl });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "MODERATE", "documents:patch");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const body = await req.json().catch((err) => {
    logger.warn("documents.patch.body_parse_fail", { err: String(err) });
    return {};
  });
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  const before = await DocumentsDB.getById(auth.tenantId, id);
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const expiresAtDate =
    parsed.data.expiresAt === undefined
      ? undefined
      : parsed.data.expiresAt === null
      ? null
      : new Date(parsed.data.expiresAt);

  const updated = await DocumentsDB.update(auth.tenantId, id, {
    name: parsed.data.name,
    folderId: parsed.data.folderId,
    category: parsed.data.category,
    tags: parsed.data.tags,
    favorite: parsed.data.favorite,
    expiresAt: expiresAtDate,
  });

  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Audit log selectivo
  const changes: string[] = [];
  if (parsed.data.name && parsed.data.name !== before.name) changes.push("rename");
  if (parsed.data.folderId !== undefined && parsed.data.folderId !== before.folderId) changes.push("move");
  if (parsed.data.tags) changes.push("tag");
  for (const action of changes) {
    DocumentsDB.log(auth.tenantId, {
      documentId: id,
      actorId: auth.username,
      action: action as "rename" | "move" | "tag",
      metadata: { from: before, to: updated },
    }).catch((err) => logger.warn("documents.audit.patch_fail", { err: String(err) }));
  }

  return NextResponse.json({ document: updated });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "MODERATE", "documents:delete");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const purge = req.nextUrl.searchParams.get("purge") === "1";

  const doc = await DocumentsDB.getByIdIncludingDeleted(auth.tenantId, id);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (purge) {
    // Hard delete + remove storage objects (incluyendo versiones históricas)
    const paths = [doc.storagePath, ...(await DocumentsDB.listVersionPaths(auth.tenantId, id))];
    await deleteFromStorage(paths).catch((e) => logger.warn("storage_cleanup_fail", { e: String(e) }));
    await DocumentsDB.hardDelete(auth.tenantId, id);
    return NextResponse.json({ ok: true, purged: true });
  }

  const ok = await DocumentsDB.softDelete(auth.tenantId, id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  DocumentsDB.log(auth.tenantId, {
    documentId: id,
    actorId: auth.username,
    action: "delete",
  }).catch((err) => logger.warn("documents.audit.delete_fail", { err: String(err) }));

  return NextResponse.json({ ok: true });
}
