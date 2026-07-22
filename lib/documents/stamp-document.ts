import { DocumentsDB } from "@/lib/db/documents.db";
import { buildStoragePath, downloadFromStorage, uploadToStorage } from "@/lib/documents/storage";
import { stampPdf, type StampPreset } from "@/lib/documents/pdf-stamp";
import { logger } from "@/lib/logger";
import type { DbDocumentVersion } from "@/lib/types/documents";

/**
 * Aplica un sello / marca de agua sobre un PDF y guarda una nueva versión +
 * audit trail. Single-source del endpoint admin `[id]/stamp`. Solo PDFs.
 */
export type StampDocumentResult =
  | { ok: true; version: DbDocumentVersion | null }
  | { ok: false; error: string; status: number };

export async function stampDocument(
  tenantId: string,
  documentId: string,
  input: { preset: StampPreset; customText?: string; actorId: string; ipAddress?: string },
): Promise<StampDocumentResult> {
  const doc = await DocumentsDB.getById(tenantId, documentId);
  if (!doc) return { ok: false, error: "not_found", status: 404 };
  if (doc.mimeType !== "application/pdf") return { ok: false, error: "only_pdf_stampable", status: 415 };

  const original = await downloadFromStorage(doc.storagePath);
  if (!original) return { ok: false, error: "storage_download_fail", status: 502 };

  const stampedBytes = await stampPdf({ pdfBytes: new Uint8Array(original), preset: input.preset, customText: input.customText });

  const newPath = buildStoragePath({ tenantId, documentId, versionLabel: "stamped", originalName: doc.originalName });
  const up = await uploadToStorage(newPath, stampedBytes, "application/pdf");
  if (!up.ok) return { ok: false, error: "storage_upload_fail", status: 502 };

  const label = input.customText?.trim() || input.preset;
  const version = await DocumentsDB.addVersion(tenantId, documentId, {
    storagePath: newPath,
    size: stampedBytes.length,
    mimeType: "application/pdf",
    uploadedById: input.actorId,
    changeNote: `Sello "${label}" aplicado`,
  });

  DocumentsDB.log(tenantId, {
    documentId,
    actorId: input.actorId,
    action: "stamp",
    metadata: { preset: input.preset, customText: input.customText, versionNumber: version?.versionNumber },
    ipAddress: input.ipAddress,
  }).catch((err) => logger.warn("documents.stamp.audit_fail", { err: String(err) }));

  return { ok: true, version };
}
