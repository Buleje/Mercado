import { DocumentsDB } from "@/lib/db/documents.db";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { logger } from "@/lib/logger";

/**
 * Flujo de aprobación de documentos (borrador → revisión → aprobado/rechazado).
 * Usa el campo `Document.status` como fuente de verdad y guarda el rastro
 * (quién pidió/aprobó/rechazó, cuándo, nota) en `ocrMetadata.approval` (sin
 * migración). Cada transición dispara una notificación al panel.
 */
export type ApprovalAction = "request" | "approve" | "reject";

type ApprovalTrail = {
  status?: string;
  requestedBy?: string;
  requestedAt?: string;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
};

const NEXT_STATUS: Record<ApprovalAction, string> = {
  request: "review",
  approve: "approved",
  reject: "draft",
};

export async function handleApproval(
  tenantId: string,
  docId: string,
  action: ApprovalAction,
  actorId: string,
  viewerRole?: string,
  note?: string,
): Promise<{ ok: true; status: string } | { ok: false; error: string; status: number }> {
  const doc = await DocumentsDB.getById(tenantId, docId, viewerRole);
  if (!doc) return { ok: false, error: "not_found", status: 404 };

  const nowIso = new Date().toISOString();
  const prev = (doc.ocrMetadata?.approval as ApprovalTrail | undefined) ?? {};
  const trail: ApprovalTrail =
    action === "request"
      ? { status: "review", requestedBy: actorId, requestedAt: nowIso, note }
      : { ...prev, status: NEXT_STATUS[action], decidedBy: actorId, decidedAt: nowIso, note };

  await DocumentsDB.update(tenantId, docId, {
    status: NEXT_STATUS[action],
    ocrMetadata: { ...(doc.ocrMetadata ?? {}), approval: trail },
  });

  DocumentsDB.log(tenantId, { documentId: docId, actorId, action: "tag", metadata: { approval: action, note } }).catch((err) =>
    logger.warn("documents.approval.audit_fail", { err: String(err) }),
  );

  // Notificación al panel según la transición.
  const notif =
    action === "request"
      ? { title: "Documento espera aprobación", body: `"${doc.name}" fue enviado a revisión.`, severity: "MEDIUM" as const }
      : action === "approve"
        ? { title: "Documento aprobado", body: `"${doc.name}" fue aprobado.`, severity: "LOW" as const }
        : { title: "Documento rechazado", body: `"${doc.name}" volvió a borrador${note ? `: ${note}` : "."}`, severity: "MEDIUM" as const };

  NotificationCenterDB.createOrReuse({
    tenantId,
    type: "DOCUMENTO_APROBACION",
    severity: notif.severity,
    title: notif.title,
    body: notif.body,
    actionUrl: "/admin?tab=documentos",
    actionLabel: "Ver documento",
    dedupWindowHours: 1,
  }).catch((err) => logger.warn("documents.approval.notify_fail", { err: String(err) }));

  return { ok: true, status: NEXT_STATUS[action] };
}
