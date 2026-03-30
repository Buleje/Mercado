import "server-only";
import { prisma } from "@/lib/prisma";

type CreateNotificationInput = {
  tenantId: string;
  type: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  entityId?: string;
};

export async function createNotification(data: CreateNotificationInput): Promise<void> {
  // Deduplication: skip if same type+entityId exists within 24h
  if (data.entityId) {
    const existing = await prisma.notification.findFirst({
      where: {
        tenantId: data.tenantId,
        type: data.type,
        entityId: data.entityId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (existing) return;
  }

  await prisma.notification.create({ data });
}
