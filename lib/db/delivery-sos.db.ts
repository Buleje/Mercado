import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * lib/db/delivery-sos.db.ts
 *
 * DB class para DeliverySOSAlert.
 * Los partners la usan desde la app movil cuando estan en peligro.
 *
 * Convenciones del proyecto:
 *   - partnerId como primer argumento de aislamiento (no hay tenantId en esta tabla)
 *   - Nunca Prisma directo fuera de DB classes (esta es la DB class → OK)
 *   - Fire-and-forget para side effects
 */

export type DeliverySOSStatus = "active" | "resolved" | "false_alarm";

export type DbDeliverySOSAlert = {
  id: string;
  partnerId: string;
  lat: number;
  lng: number;
  message: string | null;
  status: DeliverySOSStatus;
  createdAt: string;
  resolvedAt: string | null;
};

export const DeliverySOSDb = {
  /**
   * Crea una nueva alerta SOS para el partner.
   * El status inicial siempre es "active".
   */
  async create(
    partnerId: string,
    lat: number,
    lng: number,
    message?: string,
  ): Promise<DbDeliverySOSAlert> {
    const alert = await prisma.deliverySOSAlert.create({
      data: {
        partnerId,
        lat,
        lng,
        message: message ?? null,
        status: "active",
      },
    });

    logger.warn("delivery.sos.triggered", {
      alertId: alert.id,
      partnerId,
      lat,
      lng,
    });

    return {
      id:         alert.id,
      partnerId:  alert.partnerId,
      lat:        alert.lat,
      lng:        alert.lng,
      message:    alert.message,
      status:     alert.status as DeliverySOSStatus,
      createdAt:  alert.createdAt.toISOString(),
      resolvedAt: alert.resolvedAt ? alert.resolvedAt.toISOString() : null,
    };
  },

  /**
   * Resuelve o marca como falsa alarma una alerta activa.
   */
  async resolve(
    alertId: string,
    status: "resolved" | "false_alarm",
  ): Promise<void> {
    await prisma.deliverySOSAlert.update({
      where: { id: alertId },
      data: {
        status,
        resolvedAt: new Date(),
      },
    });
  },

  /**
   * Lista las alertas activas — para el panel de soporte/admin.
   */
  async listActive(): Promise<DbDeliverySOSAlert[]> {
    const rows = await prisma.deliverySOSAlert.findMany({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return rows.map((r) => ({
      id:         r.id,
      partnerId:  r.partnerId,
      lat:        r.lat,
      lng:        r.lng,
      message:    r.message,
      status:     r.status as DeliverySOSStatus,
      createdAt:  r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    }));
  },
};
