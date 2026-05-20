import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * CustomerNotificationsDB
 *
 * Acceso canónico a `CustomerNotification` (notificaciones del cliente en
 * el marketplace + storefront). Cumple CLAUDE.md regla #1:
 *   - tenantId obligatorio como primer argumento
 *   - audit + invalidation in-class (cuando aplique)
 *
 * Audit project-wide 2026-05-19 (CodeReview P0 #1): primer paso del
 * patrón para migrar las 438 routes que usan `prisma.*` directo en
 * marketplace/. Endpoint piloto: `/api/marketplace/notifications`.
 */

export interface CustomerNotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: Date;
}

export interface CustomerNotificationsResult {
  data: CustomerNotificationRow[];
  unreadCount: number;
}

export const CustomerNotificationsDB = {
  /**
   * Lista las últimas N notificaciones de un cliente (por phone) en un tenant.
   * Devuelve también el unreadCount en la misma round-trip-paralela.
   *
   * @param tenantId  tenant scope (CLAUDE.md regla #3)
   * @param phone     teléfono normalizado del cliente
   * @param limit     máximo por página (default 30, max 100)
   */
  async listByPhone(
    tenantId: string,
    phone: string,
    limit = 30,
  ): Promise<CustomerNotificationsResult> {
    const safeLimit = Math.min(100, Math.max(1, limit));
    try {
      const [notifs, unreadCount] = await Promise.all([
        prisma.customerNotification.findMany({
          where: { tenantId, customerPhone: phone },
          orderBy: { createdAt: "desc" },
          take: safeLimit,
          select: {
            id: true,
            type: true,
            title: true,
            body: true,
            link: true,
            read: true,
            createdAt: true,
          },
        }),
        prisma.customerNotification.count({
          where: { tenantId, customerPhone: phone, read: false },
        }),
      ]);
      return { data: notifs, unreadCount };
    } catch (err) {
      logger.error("[CustomerNotificationsDB.listByPhone] DB error", {
        tenantId,
        phoneHash: phone.slice(0, 4) + "***",
        err: err instanceof Error ? err.message : String(err),
      });
      // Fail-open: lista vacía en lugar de 500 para no romper la campana
      // de notificaciones en la UI del cliente.
      return { data: [], unreadCount: 0 };
    }
  },

  /**
   * Marca una notificación específica como leída. Hace check de propiedad
   * (tenantId + phone) defense-in-depth aunque el endpoint ya valide session.
   */
  async markRead(
    tenantId: string,
    phone: string,
    notificationId: string,
  ): Promise<boolean> {
    try {
      const result = await prisma.customerNotification.updateMany({
        where: { id: notificationId, tenantId, customerPhone: phone },
        data: { read: true },
      });
      return result.count > 0;
    } catch (err) {
      logger.warn("[CustomerNotificationsDB.markRead] DB error", {
        tenantId,
        err: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  },

  /**
   * Lookup por id (resuelve tenantId + customerPhone). Util para que el
   * caller pueda autorizar la accion ANTES de mutar (defense in depth).
   * Audit project-wide 2026-05-19 — migracion de /api/customer-notifications.
   */
  async getOwnership(
    notificationId: string,
  ): Promise<{ tenantId: string; customerPhone: string } | null> {
    return prisma.customerNotification.findUnique({
      where: { id: notificationId },
      select: { tenantId: true, customerPhone: true },
    });
  },

  /**
   * Marca como leídas TODAS las notifs no leídas de un customer en el tenant.
   */
  async markAllReadByPhone(tenantId: string, phone: string): Promise<number> {
    const result = await prisma.customerNotification.updateMany({
      where: { tenantId, customerPhone: phone, read: false },
      data: { read: true },
    });
    return result.count;
  },

  /**
   * Crea una notificacion para un customer. Verifica existencia del
   * customer en el tenant antes de crear (anti-spam cross-tenant).
   */
  async createForCustomer(
    tenantId: string,
    data: {
      customerPhone: string;
      type: string;
      title: string;
      body: string;
      link?: string;
    },
  ): Promise<{ ok: false; reason: "customer_not_found" } | { ok: true; row: { id: string; createdAt: Date } }> {
    const customer = await prisma.customer.findFirst({
      where: { tenantId, phone: data.customerPhone },
      select: { phone: true },
    });
    if (!customer) return { ok: false, reason: "customer_not_found" };
    const row = await prisma.customerNotification.create({
      data: {
        tenantId,
        customerPhone: data.customerPhone,
        type: data.type || "general",
        title: data.title,
        body: data.body,
        link: data.link,
      },
      select: { id: true, createdAt: true },
    });
    return { ok: true, row };
  },
};
