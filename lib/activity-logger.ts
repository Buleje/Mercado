import { prisma } from "@/lib/prisma";

export type ActivityLogEntry = {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  detail: string;
  user: string;
  createdAt: string;
};

export async function logActivity(
  action: string,
  entity: string,
  detail: string,
  entityId?: string,
  user = "admin",
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: { action, entity, entityId, detail, user },
    });
  } catch {
    // Non-critical: never let logging errors break the caller
  }
}
