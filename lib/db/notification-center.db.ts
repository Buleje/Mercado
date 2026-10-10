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
   * Un aviso por problema, no uno por día (OPER-1, 09-10).
   *
   * La clave es estable: negocio + tipo + entidad (sin entidad = el aviso
   * general de ese tipo, p. ej. «Adelantos vencidos por cobrar»). Con un aviso
   * igual SIN LEER:
   *   · dentro de la ventana (`dedupWindowHours`, 24 h por defecto) se reusa tal
   *     cual: es la misma corrida o una repetida;
   *   · fuera de la ventana se ACTUALIZA (texto, gravedad, enlace y hora, así
   *     sube arriba de la campana) y las copias viejas de la misma clave quedan
   *     leídas. Antes se creaba otro: Blas juntó 14 «Adelantos vencidos» en dos
   *     semanas, 134 de 134 sin leer.
   * Si el anterior ya se leyó, el problema que vuelve es un aviso nuevo.
   *
   * `created` conserva lo que los crons ya usaban para decidir si avisar por
   * otro canal (Telegram, WhatsApp): `true` = no había uno igual sin leer en la
   * ventana. `refreshed` = no se insertó fila: se puso al día la que había.
   */
  async createOrReuse(
    data: CreateOrReuseData,
  ): Promise<{ id: string; created: boolean; refreshed: boolean }> {
    const dedupWindowHours = data.dedupWindowHours ?? 24;
    const since = new Date(Date.now() - dedupWindowHours * 60 * 60 * 1000);

    const clave = {
      tenantId: data.tenantId,
      type: data.type,
      entityId: data.entityId ?? null,
      readAt: null,
    };

    const existing = await prisma.notification.findFirst({
      where: clave,
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    });
    if (existing && existing.createdAt >= since) {
      return { id: existing.id, created: false, refreshed: false };
    }

    if (existing) {
      const ahora = new Date();
      // La condición va en el WHERE: si alguien lo leyó entre la búsqueda y
      // esto, no se «des-lee»; se crea uno nuevo abajo.
      const { count } = await prisma.notification.updateMany({
        where: { id: existing.id, tenantId: data.tenantId, readAt: null },
        data: {
          severity: data.severity,
          title: data.title,
          body: data.body,
          actionUrl: data.actionUrl ?? null,
          actionLabel: data.actionLabel ?? null,
          createdAt: ahora,
        },
      });
      if (count > 0) {
        await prisma.notification.updateMany({
          where: { ...clave, tenantId: data.tenantId, id: { not: existing.id } },
          data: { readAt: ahora },
        });
        return { id: existing.id, created: true, refreshed: true };
      }
    }

    const { id } = await this.create(data);
    return { id, created: true, refreshed: false };
  },
};
