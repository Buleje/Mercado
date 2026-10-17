import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import {
  buildStoragePath,
  isMimeAllowed,
  uploadToStorage,
  getSignedUrl,
} from "@/lib/documents/storage";
import { scanDocument } from "@/lib/documents/scan-document";
import { MAX_UPLOAD_SIZE } from "@/lib/types/documents";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { SUPERADMIN_DOCS_TENANT } from "@/lib/documents/superadmin-vault";

/**
 * ADR-119 — Escáner desde cámara móvil.
 * Sube la foto, la analiza con visión IA y crea el Document ya con nombre,
 * categoría, tags, texto OCR y fecha de vencimiento (si la detecta).
 */
export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "sa-documents:scan");
  if (rl) return rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });
    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: "too_large", maxBytes: MAX_UPLOAD_SIZE }, { status: 413 });
    }
    const mime = file.type || "image/jpeg";
    if (!isMimeAllowed(mime) || !mime.startsWith("image/")) {
      return NextResponse.json({ error: "mime_not_allowed", mime }, { status: 415 });
    }

    const folderIdRaw = form.get("folderId");
    const folderId =
      folderIdRaw && folderIdRaw !== "null" && folderIdRaw !== "" ? String(folderIdRaw) : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const originalName = file.name || `escaneo-${Date.now()}.jpg`;

    // 1) Crear draft + subir a storage
    const draft = await DocumentsDB.create(SUPERADMIN_DOCS_TENANT, {
      folderId,
      name: originalName,
      originalName,
      mimeType: mime,
      size: file.size,
      storagePath: "pending",
      uploadedById: auth.username,
    });

    const storagePath = buildStoragePath({
      tenantId: SUPERADMIN_DOCS_TENANT,
      documentId: draft.id,
      versionLabel: "v1",
      originalName,
    });

    const up = await uploadToStorage(storagePath, buffer, mime);
    if (!up.ok) {
      await DocumentsDB.hardDelete(SUPERADMIN_DOCS_TENANT, draft.id);
      return NextResponse.json({ error: "storage_fail", detail: up.error }, { status: 502 });
    }
    await DocumentsDB.setStoragePath(SUPERADMIN_DOCS_TENANT, draft.id, storagePath);

    // 2) Analizar con visión IA (best-effort; la subida ya está a salvo)
    let scan;
    try {
      const signedUrl = await getSignedUrl(storagePath);
      scan = signedUrl ? await scanDocument(signedUrl) : { ok: false };
    } catch (err) {
      logger.warn("sa-documents.scan.vision_fail", { err: String(err) });
      scan = { ok: false };
    }

    let updated = draft;
    if (scan?.ok) {
      const patched = await DocumentsDB.update(SUPERADMIN_DOCS_TENANT, draft.id, {
        name: scan.suggestedName || originalName,
        category: scan.category,
        tags: scan.tags,
        aiCategory: scan.category,
        aiTags: scan.tags,
        ocrText: scan.ocrText,
        expiresAt: scan.expiresAt ? new Date(scan.expiresAt) : undefined,
      });
      if (patched) updated = patched;
    }

    DocumentsDB.log(SUPERADMIN_DOCS_TENANT, {
      documentId: draft.id,
      actorId: auth.username,
      action: "upload",
      metadata: { source: "scan", aiOk: !!scan?.ok, detectedExpiry: scan?.ok ? scan.expiresAt : null },
    }).catch((err) => logger.warn("sa-documents.audit.scan_fail", { err: String(err) }));

    return NextResponse.json({
      document: updated,
      scan: scan?.ok
        ? { ok: true, suggestedName: scan.suggestedName, category: scan.category, expiresAt: scan.expiresAt }
        : { ok: false },
    });
  } catch (err) {
    logger.error("sa-documents.scan.exception", { err: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
