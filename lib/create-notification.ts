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
  // F4: dedup + create dentro de una transaction para reducir la ventana de race
  // con BullMQ workers. El findFirst + create separados eran no atómicos.
  // FIXME: para dedup perfecto agregar @@unique([tenantId, type, entityId, dayBucket])
  // en schema.prisma y usar upsert cuando se programe la migration.
  await prisma.$transaction(async (tx) => {
    if (data.entityId) {
      const existing = await tx.notification.findFirst({
        where: {
          tenantId: data.tenantId,
          type: data.type,
          entityId: data.entityId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (existing) return;
    }

    await tx.notification.create({ data });
  });
}
