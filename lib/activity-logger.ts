import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

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

export async function logActivity(
  action: string,
  entity: string,
  detail: string,
  entityId?: string,
  user = "admin",
  requestId?: string,
): Promise<void> {
  try {
    logger.info("[activity]", { action, entity, entityId, user, requestId });
    await prisma.activityLog.create({
      data: { action, entity, entityId, detail, user },
    });
  } catch {
    // Non-critical: never let logging errors break the caller
  }
}
