/**
 * Worker: log-activity
 *
 * Persiste entradas de actividad en la base de datos.
 * Actualmente logActivity() escribe directamente con Prisma — este worker
 * desacopla el write de la request principal, protegiéndola de latencia de DB.
 *
 * No reintenta si Prisma falla por unique constraint u otros errores 4xx-equivalentes.
 * Sí reintenta en errores de conexión o timeout.
 */

import { logger } from "@/lib/logger";
import { queue, ActivityPayloadSchema, type JobEnvelope } from "@/lib/queue";
import { prisma } from "@/lib/prisma";

export async function handleLogActivity(envelope: JobEnvelope): Promise<void> {
  const parsed = ActivityPayloadSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    logger.error("[worker:log-activity] Invalid payload — skipping retry", {
      jobId: envelope.jobId,
      issues: parsed.error.issues,
    });
    return;
  }

  const { tenantId, action, entity, detail, entityId, user, requestId } = parsed.data;

  try {
    await prisma.activityLog.create({
      data: {
        action,
        entity,
        entityId,
        detail,
        user,
      },
    });

    logger.info("[worker:log-activity] Activity logged", {
      jobId: envelope.jobId,
      tenantId,
      action,
      entity,
      entityId,
      user,
      requestId,
      attempt: envelope.attempt,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Unique constraint o errores de validación → no reintentar
    const isPermanentError =
      errorMessage.includes("Unique constraint") ||
      errorMessage.includes("Foreign key constraint") ||
      errorMessage.includes("violates not-null constraint");

    if (isPermanentError) {
      logger.warn("[worker:log-activity] Permanent DB error — not retrying", {
        jobId: envelope.jobId,
        tenantId,
        error: errorMessage,
      });
      return;
    }

    logger.error("[worker:log-activity] Failed to log activity", {
      jobId: envelope.jobId,
      tenantId,
      action,
      entity,
      attempt: envelope.attempt,
      error: errorMessage,
    });

    await queue.retry(envelope);
  }
}
