import { DocumentsDB } from "@/lib/db/documents.db";
import { buildStoragePath, downloadFromStorage, uploadToStorage } from "@/lib/documents/storage";
import { mergeToPdf, type MergeItem } from "@/lib/documents/pdf-merge";
import { logger } from "@/lib/logger";
import type { DbDocument } from "@/lib/types/documents";

/**
 * Combina varios documentos (PDFs + imágenes) del drive en un PDF nuevo, lo sube
 * como documento independiente y lo registra. Los IDs mantienen el orden pedido.
 */
export type MergeResult =
  | { ok: true; document: DbDocument; pageCount: number; skipped: string[] }
  | { ok: false; error: string; status: number };

export async function mergeDocuments(
  tenantId: string,
  ids: string[],
  input: { name?: string; folderId?: string | null; actorId: string; ipAddress?: string },
): Promise<MergeResult> {
  if (ids.length < 2) return { ok: false, error: "need_at_least_two", status: 400 };

  const docs = await Promise.all(ids.map((id) => DocumentsDB.getById(tenantId, id)));
  const found = docs.filter((d): d is DbDocument => !!d);
  if (found.length < 2) return { ok: false, error: "not_found", status: 404 };

  const items: MergeItem[] = [];
  for (const d of found) {
    const buf = await downloadFromStorage(d.storagePath);
    if (buf) items.push({ bytes: new Uint8Array(buf), mimeType: d.mimeType, name: d.name });
  }
  if (items.length < 2) return { ok: false, error: "storage_download_fail", status: 502 };

  const merged = await mergeToPdf(items);
  if (merged.pageCount === 0) return { ok: false, error: "no_mergeable_pages", status: 422 };

  const name = (input.name?.trim() || `Combinado ${found.length} documentos`).slice(0, 120);
  const fileName = `${name.replace(/[^\w.-]+/g, "_")}.pdf`;

  const draft = await DocumentsDB.create(tenantId, {
    folderId: input.folderId ?? null,
    name,
    originalName: fileName,
    mimeType: "application/pdf",
    size: merged.bytes.length,
    storagePath: "pending",
    category: "otros",
    uploadedById: input.actorId,
  });

  const storagePath = buildStoragePath({ tenantId, documentId: draft.id, versionLabel: "v1", originalName: fileName });
  const up = await uploadToStorage(storagePath, merged.bytes, "application/pdf");
  if (!up.ok) {
    await DocumentsDB.hardDelete(tenantId, draft.id);
    return { ok: false, error: "storage_upload_fail", status: 502 };
  }
  await DocumentsDB.setStoragePath(tenantId, draft.id, storagePath);

  DocumentsDB.log(tenantId, {
    documentId: draft.id,
    actorId: input.actorId,
    action: "merge",
    metadata: { sourceIds: ids, pageCount: merged.pageCount, skipped: merged.skipped },
    ipAddress: input.ipAddress,
  }).catch((err) => logger.warn("documents.merge.audit_fail", { err: String(err) }));

  return { ok: true, document: { ...draft, storagePath }, pageCount: merged.pageCount, skipped: merged.skipped };
}
