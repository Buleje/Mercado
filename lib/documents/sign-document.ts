import { DocumentsDB } from "@/lib/db/documents.db";
import { buildStoragePath, downloadFromStorage, uploadToStorage } from "@/lib/documents/storage";
import { signPdfVisually } from "@/lib/documents/pdf-signer";
import { logger } from "@/lib/logger";
import type { DbDocumentVersion } from "@/lib/types/documents";

/**
 * Aplica una firma visual (sello + hash SHA-256) sobre un PDF y guarda una nueva
 * versión firmada + audit trail. Single-source: lo usan tanto el endpoint admin
 * (`/api/admin/documents/[id]/sign`) como el público de solicitud de firma
 * (`/api/public/documents/[token]/sign`). Solo PDFs.
 */
export type ApplySignatureResult =
  | { ok: true; version: DbDocumentVersion | null; originalSha256: string; signedAt: string }
  | { ok: false; error: string; status: number };

export async function applySignature(
  tenantId: string,
  documentId: string,
  input: {
    signerName: string;
    signerRole?: string;
    signatureImagePngBase64?: string;
    actorId: string;
    ipAddress?: string;
  },
): Promise<ApplySignatureResult> {
  const doc = await DocumentsDB.getById(tenantId, documentId);
  if (!doc) return { ok: false, error: "not_found", status: 404 };
  if (doc.mimeType !== "application/pdf") return { ok: false, error: "only_pdf_signable", status: 415 };

  const original = await downloadFromStorage(doc.storagePath);
  if (!original) return { ok: false, error: "storage_download_fail", status: 502 };

  const result = await signPdfVisually({
    pdfBytes: original,
    signerName: input.signerName,
    signerRole: input.signerRole,
    signatureImagePngBase64: input.signatureImagePngBase64,
    ipAddress: input.ipAddress,
  });

  const newPath = buildStoragePath({
    tenantId,
    documentId,
    versionLabel: "signed",
    originalName: doc.originalName,
  });
  const up = await uploadToStorage(newPath, result.signedBytes, "application/pdf");
  if (!up.ok) return { ok: false, error: "storage_upload_fail", status: 502 };

  const version = await DocumentsDB.addVersion(tenantId, documentId, {
    storagePath: newPath,
    size: result.signedBytes.length,
    mimeType: "application/pdf",
    uploadedById: input.actorId,
    changeNote: `Firmado por ${input.signerName}`,
  });

  DocumentsDB.log(tenantId, {
    documentId,
    actorId: input.actorId,
    action: "sign",
    metadata: {
      signerName: input.signerName,
      signerRole: input.signerRole,
      originalSha256: result.originalSha256,
      signedAt: result.signedAt,
      versionNumber: version?.versionNumber,
    },
    ipAddress: input.ipAddress,
  }).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));

  return { ok: true, version, originalSha256: result.originalSha256, signedAt: result.signedAt };
}
