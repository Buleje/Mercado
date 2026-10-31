import { withRlsTx } from "@/lib/prisma-rls";
import { logger } from "@/lib/logger";
import { enqueueActivityLog, type ActivityLogJobData } from "@/lib/queue/queues";
import { errorSinDatos } from "@/lib/error-sin-datos";

export type ActivityLogEntry = {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  detail: string;
  user: string;
  requestId?: string;
  createdAt: string;
};

/**
 * Write an activity log entry directly to the database (synchronous path).
 * This is the original function — kept as-is for backward compatibility.
 *
 * Nunca tira, salvo `opts.tirar`: quien TIENE que saber si el renglón quedó
 * (la auditoría del libro CTP, que reintenta) lo pide. Sin la opción, un fallo
 * ya no se calla: se loguea. Medido 23-09: 8 cobros a la vez sobre la misma
 * corrida dejaron 13 de 16 renglones — la transacción del log no conseguía
 * conexión mientras las otras esperaban el lock — y nada lo decía.
 */
export async function logActivity(
  action: string,
  entity: string,
  detail: string,
  entityId?: string,
  user = "admin",
  requestId?: string,
  tenantId?: string,
  opts: { tirar?: boolean } = {},
): Promise<void> {
  try {
    // P1-1 multi-tenant: tenantId omitido => WARN observable.
    // Audit 2026-06-10 P2: el fallback ya NO es "main" — contaminaba la cadena
    // de auditoría (Ley 29733) de un tenant productivo. "__unknown__" mantiene
    // el log sin atribuirlo a nadie y es greppeable para cazar call sites.
    const effectiveTenantId = tenantId ?? "__unknown__";
    if (!tenantId) {
      logger.warn("[activity] missing tenantId — logging as '__unknown__'", { action, entity, user });
    }
    logger.info("[activity]", { action, entity, entityId, user, requestId, tenantId: effectiveTenantId });
    // TD-116 (2026-06-10): write vía withRlsTx — ActivityLog tiene RLS.
    await withRlsTx(effectiveTenantId, (tx) => tx.activityLog.create({
      data: { action, entity, entityId, detail, user, tenantId: effectiveTenantId },
    }));
  } catch (err) {
    if (opts.tirar) throw err;
    // Non-critical: never let logging errors break the caller — but say it.
    logger.warn("[activity] no se pudo escribir el renglón", {
      action,
      entity,
      entityId,
      tenantId: tenantId ?? "__unknown__",
      error: errorSinDatos(err),
    });
  }
}

/**
 * Enqueue an activity log entry via BullMQ (async path).
 * Falls back to direct DB write when Redis/BullMQ is unavailable.
 *
 * Use this in hot paths (e.g. API routes, mutations) to offload the
 * DB write to the background worker. Call sites don't need to change
 * anything else — the interface is the same as `logActivity`.
 */
export async function logActivityQueued(
  action: string,
  entity: string,
  detail: string,
  entityId?: string,
  user = "admin",
  _requestId?: string,
  tenantId?: string,
): Promise<void> {
  try {
    // Audit 2026-06-10 P2: "__unknown__" en vez de "main" (ver logActivity).
    const effectiveTenantId = tenantId ?? "__unknown__";
    if (!tenantId) {
      logger.warn("[activity-queued] missing tenantId — logging as '__unknown__'", { action, entity, user });
    }
    const jobData: ActivityLogJobData = {
      action,
      resource: entity,
      resourceId: entityId,
      userId: user,
      tenantId: effectiveTenantId,
      details: detail ? { detail } : undefined,
      timestamp: new Date().toISOString(),
    };

    const jobId = await enqueueActivityLog(jobData);

    if (jobId === null) {
      // Queue unavailable (no Redis) — fallback to direct write
      await logActivity(action, entity, detail, entityId, user, _requestId, effectiveTenantId);
    }
  } catch {
    // Last resort: try direct write
    const fallbackTenant = tenantId ?? "__unknown__";
    await logActivity(action, entity, detail, entityId, user, _requestId, fallbackTenant).catch((err) => {
      logger.error("[activity-logger] last-resort direct write failed", { error: String(err), action, entity, tenantId: fallbackTenant });
    });
  }
}
