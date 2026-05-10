import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import {
  buildStoragePath,
  isMimeAllowed,
  uploadToStorage,
} from "@/lib/documents/storage";
import { MAX_UPLOAD_SIZE } from "@/lib/types/documents";


type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "MODERATE", "documents:versions:list");
  if (rl) return rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const versions = await DocumentsDB.listVersions(auth.tenantId, id);
  return NextResponse.json({ versions });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "STRICT", "documents:version:upload");
  if (rl) return rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const doc = await DocumentsDB.getById(auth.tenantId, id);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });
    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
    const mime = file.type || "application/octet-stream";
    if (!isMimeAllowed(mime)) {
      return NextResponse.json({ error: "mime_not_allowed", mime }, { status: 415 });
    }
    const changeNote = (form.get("changeNote") as string | null) ?? undefined;

    const versions = await DocumentsDB.listVersions(auth.tenantId, id);
    const nextLabel = `v${(versions[0]?.versionNumber ?? 1) + 1}`;

    const storagePath = buildStoragePath({
      tenantId: auth.tenantId,
      documentId: id,
      versionLabel: nextLabel,
      originalName: file.name || "archivo",
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const up = await uploadToStorage(storagePath, buffer, mime);
    if (!up.ok) {
      return NextResponse.json({ error: "storage_fail", detail: up.error }, { status: 502 });
    }

    const v = await DocumentsDB.addVersion(auth.tenantId, id, {
      storagePath,
      size: file.size,
      mimeType: mime,
      uploadedById: auth.username,
      changeNote,
    });
    if (!v) return NextResponse.json({ error: "version_fail" }, { status: 500 });

    DocumentsDB.log(auth.tenantId, {
      documentId: id,
      actorId: auth.username,
      action: "version",
      metadata: { versionNumber: v.versionNumber, size: file.size, changeNote },
    }).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));

    return NextResponse.json({ version: v });
  } catch (err) {
    logger.error("documents.version.exception", { err: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
