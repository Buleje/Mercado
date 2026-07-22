import { DocumentsDB } from "@/lib/db/documents.db";
import { buildStoragePath, downloadFromStorage, uploadToStorage } from "@/lib/documents/storage";
import { rotatePdfAllPages, splitPdfPerPage, rebuildPdf } from "@/lib/documents/pdf-pages";
import { logger } from "@/lib/logger";
import type { DbDocument, DbDocumentVersion } from "@/lib/types/documents";

/** Reordena/elimina/rota páginas individuales de un PDF → nueva versión. */
export async function editPdfPages(
  tenantId: string,
  documentId: string,
  spec: { index: number; rotate?: number }[],
  actorId: string,
): Promise<{ ok: true; version: DbDocumentVersion | null } | { ok: false; error: string; status: number }> {
  const doc = await DocumentsDB.getById(tenantId, documentId);
  if (!doc) return { ok: false, error: "not_found", status: 404 };
  if (doc.mimeType !== "application/pdf") return { ok: false, error: "only_pdf", status: 415 };
  if (spec.length === 0) return { ok: false, error: "empty_result", status: 400 };

  const original = await downloadFromStorage(doc.storagePath);
  if (!original) return { ok: false, error: "storage_download_fail", status: 502 };

  const rebuilt = await rebuildPdf(new Uint8Array(original), spec);
  const newPath = buildStoragePath({ tenantId, documentId, versionLabel: "pages", originalName: doc.originalName });
  const up = await uploadToStorage(newPath, rebuilt, "application/pdf");
  if (!up.ok) return { ok: false, error: "storage_upload_fail", status: 502 };

  const version = await DocumentsDB.addVersion(tenantId, documentId, {
    storagePath: newPath,
    size: rebuilt.length,
    mimeType: "application/pdf",
    uploadedById: actorId,
    changeNote: `Páginas editadas (${spec.length})`,
  });
  DocumentsDB.log(tenantId, { documentId, actorId, action: "version", metadata: { op: "edit-pages", pages: spec.length } }).catch((err) =>
    logger.warn("documents.editpages.audit_fail", { err: String(err) }),
  );
  return { ok: true, version };
}

/** Rota un PDF (todas las páginas) → nueva versión. */
export async function rotateDocument(
  tenantId: string,
  documentId: string,
  deg: number,
  actorId: string,
): Promise<{ ok: true; version: DbDocumentVersion | null } | { ok: false; error: string; status: number }> {
  const doc = await DocumentsDB.getById(tenantId, documentId);
  if (!doc) return { ok: false, error: "not_found", status: 404 };
  if (doc.mimeType !== "application/pdf") return { ok: false, error: "only_pdf", status: 415 };

  const original = await downloadFromStorage(doc.storagePath);
  if (!original) return { ok: false, error: "storage_download_fail", status: 502 };

  const rotated = await rotatePdfAllPages(new Uint8Array(original), ((deg % 360) + 360) % 360);
  const newPath = buildStoragePath({ tenantId, documentId, versionLabel: "rotated", originalName: doc.originalName });
  const up = await uploadToStorage(newPath, rotated, "application/pdf");
  if (!up.ok) return { ok: false, error: "storage_upload_fail", status: 502 };

  const version = await DocumentsDB.addVersion(tenantId, documentId, {
    storagePath: newPath,
    size: rotated.length,
    mimeType: "application/pdf",
    uploadedById: actorId,
    changeNote: `Rotado ${deg}°`,
  });
  DocumentsDB.log(tenantId, { documentId, actorId, action: "version", metadata: { op: "rotate", degrees: deg } }).catch((err) =>
    logger.warn("documents.rotate.audit_fail", { err: String(err) }),
  );
  return { ok: true, version };
}

/** Divide un PDF en un documento por página. Crea N documentos nuevos. */
export async function splitDocument(
  tenantId: string,
  documentId: string,
  input: { actorId: string; folderId?: string | null },
): Promise<{ ok: true; created: DbDocument[] } | { ok: false; error: string; status: number }> {
  const doc = await DocumentsDB.getById(tenantId, documentId);
  if (!doc) return { ok: false, error: "not_found", status: 404 };
  if (doc.mimeType !== "application/pdf") return { ok: false, error: "only_pdf", status: 415 };

  const original = await downloadFromStorage(doc.storagePath);
  if (!original) return { ok: false, error: "storage_download_fail", status: 502 };

  const pages = await splitPdfPerPage(new Uint8Array(original));
  if (pages.length <= 1) return { ok: false, error: "single_page", status: 422 };

  const baseName = doc.name.replace(/\.pdf$/i, "");
  const created: DbDocument[] = [];
  for (const p of pages) {
    const name = `${baseName} — pág. ${p.pageNumber}`;
    const fileName = `${name.replace(/[^\w.-]+/g, "_")}.pdf`;
    const draft = await DocumentsDB.create(tenantId, {
      folderId: input.folderId ?? doc.folderId,
      name,
      originalName: fileName,
      mimeType: "application/pdf",
      size: p.bytes.length,
      storagePath: "pending",
      category: doc.category,
      uploadedById: input.actorId,
    });
    const path = buildStoragePath({ tenantId, documentId: draft.id, versionLabel: "v1", originalName: fileName });
    const up = await uploadToStorage(path, p.bytes, "application/pdf");
    if (!up.ok) {
      await DocumentsDB.hardDelete(tenantId, draft.id);
      continue;
    }
    await DocumentsDB.setStoragePath(tenantId, draft.id, path);
    created.push({ ...draft, storagePath: path });
  }

  DocumentsDB.log(tenantId, { documentId, actorId: input.actorId, action: "version", metadata: { op: "split", pages: pages.length } }).catch((err) =>
    logger.warn("documents.split.audit_fail", { err: String(err) }),
  );
  return { ok: true, created };
}
