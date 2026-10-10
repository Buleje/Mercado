import { DocumentsDB } from "@/lib/db/documents.db";
import { logger } from "@/lib/logger";

/**
 * Vincula/desvincula dos documentos de forma BIDIRECCIONAL guardando la lista de
 * IDs relacionados dentro de `ocrMetadata.relatedIds` (sin migración — el campo
 * es Json). Ej: un contrato ↔ su adenda, una factura ↔ su recibo de pago.
 */
export function getRelatedIds(meta: Record<string, unknown> | null | undefined): string[] {
  const r = meta?.relatedIds;
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === "string") : [];
}

export type RelateResult = { ok: true; relatedIds: string[] } | { ok: false; error: string; status: number };

export async function linkDocuments(
  tenantId: string,
  aId: string,
  bId: string,
  link: boolean,
  actorId: string,
  viewerRole?: string,
): Promise<RelateResult> {
  if (aId === bId) return { ok: false, error: "cannot_relate_self", status: 400 };

  const [a, b] = await Promise.all([DocumentsDB.getById(tenantId, aId, viewerRole), DocumentsDB.getById(tenantId, bId, viewerRole)]);
  if (!a || !b) return { ok: false, error: "not_found", status: 404 };

  const aRel = new Set(getRelatedIds(a.ocrMetadata));
  const bRel = new Set(getRelatedIds(b.ocrMetadata));
  if (link) {
    aRel.add(bId);
    bRel.add(aId);
  } else {
    aRel.delete(bId);
    bRel.delete(aId);
  }

  await DocumentsDB.update(tenantId, aId, { ocrMetadata: { ...a.ocrMetadata, relatedIds: [...aRel] } });
  await DocumentsDB.update(tenantId, bId, { ocrMetadata: { ...b.ocrMetadata, relatedIds: [...bRel] } });

  DocumentsDB.log(tenantId, {
    documentId: aId,
    actorId,
    action: "link",
    metadata: { relatedId: bId, linked: link },
  }).catch((err) => logger.warn("documents.relate.audit_fail", { err: String(err) }));

  return { ok: true, relatedIds: [...aRel] };
}
