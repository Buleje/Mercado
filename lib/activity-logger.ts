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
  tenantId = "main",
): Promise<void> {
  try {
    logger.info("[activity]", { action, entity, entityId, user, requestId });
    await prisma.activityLog.create({
      data: { action, entity, entityId, detail, user, tenantId },
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
  tenantId = "main",
): Promise<void> {
  try {
    const jobData: ActivityLogJobData = {
      action,
      resource: entity,
      resourceId: entityId,
      userId: user,
      tenantId,
      details: detail ? { detail } : undefined,
      timestamp: new Date().toISOString(),
    };

    const jobId = await enqueueActivityLog(jobData);

    if (jobId === null) {
      // Queue unavailable (no Redis) — fallback to direct write
      await logActivity(action, entity, detail, entityId, user, _requestId, tenantId);
    }
  } catch {
    // Last resort: try direct write
    await logActivity(action, entity, detail, entityId, user, _requestId, tenantId).catch((err) => {
      logger.error("[activity-logger] last-resort direct write failed", { error: String(err), action, entity, tenantId });
    });
  }
}
