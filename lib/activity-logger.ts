import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { enqueueActivityLog, type ActivityLogJobData } from "@/lib/queue/queues";

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
 */
export async function logActivity(
  action: string,
  entity: string,
  detail: string,
  entityId?: string,
  user = "admin",
  requestId?: string,
  tenantId?: string,
): Promise<void> {
  try {
    // P1-1 multi-tenant: tenantId omitido => log al tenant principal con WARN.
    // ANTES: default silente = "main" enmascaraba bugs de propagación.
    // AHORA: observable via logs hasta que todos los 200+ call sites pasen tenantId.
    const effectiveTenantId = tenantId ?? "main";
    if (!tenantId) {
      logger.warn("[activity] missing tenantId — falling back to 'main'", { action, entity, user });
    }
    logger.info("[activity]", { action, entity, entityId, user, requestId, tenantId: effectiveTenantId });
    await prisma.activityLog.create({
      data: { action, entity, entityId, detail, user, tenantId: effectiveTenantId },
    });
  } catch {
    // Non-critical: never let logging errors break the caller
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
    const effectiveTenantId = tenantId ?? "main";
    if (!tenantId) {
      logger.warn("[activity-queued] missing tenantId — falling back to 'main'", { action, entity, user });
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
    const fallbackTenant = tenantId ?? "main";
    await logActivity(action, entity, detail, entityId, user, _requestId, fallbackTenant).catch((err) => {
      logger.error("[activity-logger] last-resort direct write failed", { error: String(err), action, entity, tenantId: fallbackTenant });
    });
  }
}
