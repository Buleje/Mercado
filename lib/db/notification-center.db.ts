/**
 * lib/db/notification-center.db.ts
 *
 * DB class para Notification (in-app notifications del admin del tenant).
 * Modelo distinto a NotificationLog — éste es para alertas que el admin
 * ve en su panel (notification-center bell icon), mientras que
 * NotificationLog rastrea envíos de WhatsApp/email.
 *
 * Patrón idempotent createOrReuse para crons periódicos: si ya existe una
 * notification del mismo (tenantId, type, entityId) sin leer dentro de la
 * ventana, no crear duplicado. Útil para alertas que se repiten cada run
 * del cron mientras el problema sigue activo (ej: RUC NO HABIDO).
 *
 * Audit ref: TD-058 — notification persistent al admin cuando RENIEC/SUNAT
 * detecta degradación de identidad.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type Severity = "HIGH" | "MEDIUM" | "LOW";

export interface CreateNotificationInput {
  tenantId: string;
  type: string;
  severity: Severity;
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  entityId?: string;
}

export interface CreateOrReuseInput extends CreateNotificationInput {
  /**
   * Ventana de idempotencia. Si existe una notification con misma
   * (tenantId, type, entityId) creada dentro de esta ventana y sin leer,
   * no crea duplicado.
   * Default: 24h.
   */
  dedupWindowHours?: number;
}

export const NotificationCenterDB = {
  /**
   * Crea una notification simple (NO idempotente — usar createOrReuse para
   * alerts repetitivas de crons).
   */
  async create(input: CreateNotificationInput): Promise<{ id: string; created: true }> {
    const row = await prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        type: input.type,
        severity: input.severity,
        title: input.title,
        body: input.body,
        ...(input.actionUrl != null && { actionUrl: input.actionUrl }),
        ...(input.actionLabel != null && { actionLabel: input.actionLabel }),
        ...(input.entityId != null && { entityId: input.entityId }),
      },
      select: { id: true },
    });
    logger.info("[NotificationCenter] created", {
      id: row.id,
      tenantId: input.tenantId,
      type: input.type,
      severity: input.severity,
    });
    return { id: row.id, created: true };
  },

  /**
   * Idempotent: crea la notification SOLO si no existe una equivalente
   * dentro de la ventana de dedup. Retorna { created: false, existingId }
   * si reusa una existente.
   */
  async createOrReuse(
    input: CreateOrReuseInput,
  ): Promise<{ id: string; created: boolean }> {
    const window = input.dedupWindowHours ?? 24;
    const since = new Date(Date.now() - window * 60 * 60 * 1000);

    const where: Record<string, unknown> = {
      tenantId: input.tenantId,
      type: input.type,
      readAt: null,
      createdAt: { gte: since },
    };
    if (input.entityId) {
      where.entityId = input.entityId;
    }

    const existing = await prisma.notification.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (existing) {
      logger.info("[NotificationCenter] reused existing", {
        id: existing.id,
        tenantId: input.tenantId,
        type: input.type,
        entityId: input.entityId,
      });
      return { id: existing.id, created: false };
    }

    const created = await this.create({
      tenantId: input.tenantId,
      type: input.type,
      severity: input.severity,
      title: input.title,
      body: input.body,
      ...(input.actionUrl != null && { actionUrl: input.actionUrl }),
      ...(input.actionLabel != null && { actionLabel: input.actionLabel }),
      ...(input.entityId != null && { entityId: input.entityId }),
    });
    return { id: created.id, created: true };
  },

  /** Helper para marcar como leído por id (con scope tenant). */
  async markAsRead(tenantId: string, id: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { id, tenantId, readAt: null },
      data: { readAt: new Date() },
    });
  },
};
