import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * NotificationCenterDB
 *
 * Notificaciones in-app del admin (Notification Center) — modelo
 * `Notification` (diferente de `NotificationLog` que es para WhatsApp
 * delivery tracking).
 *
 * Audit project-wide 2026-05-19 — migracion de /api/notification-center.
 */

interface ListOpts {
  unread?: boolean;
  severity?: string | null;
  canSeeHigh: boolean;
  limit?: number;
}

interface CreateData {
  tenantId: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  entityId?: string;
}

interface CreateOrReuseData extends CreateData {
  dedupWindowHours?: number;
}

export const NotificationCenterDB = {
  /**
   * Lista notificaciones admin filtradas por severity + unread + role.
   * El gate de HIGH severity esta dentro del helper: si !canSeeHigh,
   * excluye HIGH del listado (lectura del role decision del caller).
   *
   * Devuelve { items, unreadCount } en single round-trip Promise.all.
   */
  async listForAdmin(
    tenantId: string,
    opts: ListOpts,
  ): Promise<{ items: unknown[]; unreadCount: number }> {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const where: Record<string, unknown> = { tenantId };
    if (opts.unread) where.readAt = null;

    if (opts.severity && ["HIGH", "MEDIUM", "LOW"].includes(opts.severity)) {
      where.severity = opts.severity;
    } else if (!opts.canSeeHigh) {
      where.severity = { not: "HIGH" };
    }

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({
        where: { tenantId, readAt: null },
      }),
    ]);
    return { items, unreadCount };
  },

  /**
   * Crea una notification con campos requeridos + opcionales (actionUrl,
   * actionLabel, entityId). Devuelve { id, created: true }.
   *
   * Audit project-wide 2026-05-19 — unblock cron/vendor-identity-recheck.
   */
  async create(data: CreateData): Promise<{ id: string; created: true }> {
    const payload: Record<string, unknown> = {
      tenantId: data.tenantId,
      type: data.type,
      severity: data.severity,
      title: data.title,
      body: data.body,
    };
    if (data.actionUrl !== undefined) payload.actionUrl = data.actionUrl;
    if (data.actionLabel !== undefined) payload.actionLabel = data.actionLabel;
    if (data.entityId !== undefined) payload.entityId = data.entityId;

    const row = await prisma.notification.create({
      data: payload as never,
      select: { id: true },
    });
    return { id: row.id, created: true };
  },

  /**
   * Crea o reusa una notification existente con el mismo (tenantId, type,
   * entityId) creada en las ultimas N horas y aun no leida. Patron usado
   * por crons periodicos que disparan la misma alerta hasta que el problema
   * se resuelve — evita spam del Notification Center.
   *
   * Default dedupWindowHours = 24h.
   */
  async createOrReuse(data: CreateOrReuseData): Promise<{ id: string; created: boolean }> {
    const dedupWindowHours = data.dedupWindowHours ?? 24;
    const since = new Date(Date.now() - dedupWindowHours * 60 * 60 * 1000);

    const where: Record<string, unknown> = {
      tenantId: data.tenantId,
      type: data.type,
      readAt: null,
      createdAt: { gte: since },
    };
    if (data.entityId !== undefined) where.entityId = data.entityId;

    const existing = await prisma.notification.findFirst({
      where,
      select: { id: true },
    });
    if (existing) {
      return { id: existing.id, created: false };
    }

    const { id } = await this.create(data);
    return { id, created: true };
  },
};
