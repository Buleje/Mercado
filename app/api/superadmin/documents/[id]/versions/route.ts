import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { resolverMime } from "@/lib/documents/tipos-archivo";
import { DocumentsDB } from "@/lib/db/documents.db";
import {
  buildStoragePath,
  isMimeAllowed,
  uploadToStorage,
} from "@/lib/documents/storage";
import { MAX_UPLOAD_SIZE } from "@/lib/types/documents";
import { SUPERADMIN_DOCS_TENANT } from "@/lib/documents/superadmin-vault";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "MODERATE", "sa-documents:versions:list");
  if (rl) return rl;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const versions = await DocumentsDB.listVersions(SUPERADMIN_DOCS_TENANT, id);
  return NextResponse.json({ versions });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "STRICT", "sa-documents:version:upload");
  if (rl) return rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const doc = await DocumentsDB.getById(SUPERADMIN_DOCS_TENANT, id);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });
    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
    const mime = resolverMime(file.name, file.type);
    if (!isMimeAllowed(mime, file.name)) {
      return NextResponse.json({ error: "mime_not_allowed", mime }, { status: 415 });
    }
    const changeNote = (form.get("changeNote") as string | null) ?? undefined;

    const versions = await DocumentsDB.listVersions(SUPERADMIN_DOCS_TENANT, id);
    const nextLabel = `v${(versions[0]?.versionNumber ?? 1) + 1}`;

    const storagePath = buildStoragePath({
      tenantId: SUPERADMIN_DOCS_TENANT,
      documentId: id,
      versionLabel: nextLabel,
      originalName: file.name || "archivo",
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const up = await uploadToStorage(storagePath, buffer, mime);
    if (!up.ok) {
      return NextResponse.json({ error: "storage_fail", detail: up.error }, { status: 502 });
    }

    const v = await DocumentsDB.addVersion(SUPERADMIN_DOCS_TENANT, id, {
      storagePath,
      size: file.size,
      mimeType: mime,
      uploadedById: auth.username,
      changeNote,
    });
    if (!v) return NextResponse.json({ error: "version_fail" }, { status: 500 });

    DocumentsDB.log(SUPERADMIN_DOCS_TENANT, {
      documentId: id,
      actorId: auth.username,
      action: "version",
      metadata: { versionNumber: v.versionNumber, size: file.size, changeNote },
    }).catch((err) => logger.warn("sa-documents.audit.fail", { err: String(err) }));

    return NextResponse.json({ version: v });
  } catch (err) {
    logger.error("sa-documents.version.exception", { err: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
