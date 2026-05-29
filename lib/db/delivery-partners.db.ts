import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * DeliveryPartnersDB
 *
 * Acceso canonico a `DeliveryPartner` — repartidores que aplican al
 * marketplace. Audit project-wide 2026-05-19 (CodeReview P0 #1):
 * migracion de marketplace/drivers/apply.
 *
 * Idempotente por (phone, tenantId): re-aplicar refresca KYC.
 * NO reactiva isActive (mantener decision admin previa).
 */

export interface DriverApplyData {
  name: string;
  email: string | null;
  zone: string;
  vehicleType: string;
  kycNotesJson: string;
}

export const DeliveryPartnersDB = {
  /**
   * Retorna todos los partners activos del tenant con sus assignments
   * para el período indicado (since). Usado por el ranking de repartidores.
   *
   * tenantId SIEMPRE 1er parámetro.
   */
  async getRanking(tenantId: string, since: Date) {
    return prisma.deliveryPartner.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true, name: true, phone: true, vehicleType: true,
        rating: true, acceptanceRate: true,
        totalOffers: true, totalAccepted: true,
        assignments: {
          where: { createdAt: { gte: since } },
          select: { status: true, fee: true, deliveredAt: true, pickedUpAt: true, createdAt: true },
        },
      },
    });
  },

  /**
   * Upsert idempotente para una aplicacion de repartidor:
   *   - Si existe (phone, tenantId): actualiza datos KYC, conserva isActive.
   *   - Si no existe: crea con isActive=false (pendiente de aprobacion).
   * Retorna el id del partner.
   */
  async upsertApplication(
    tenantId: string,
    phoneDigits: string,
    data: DriverApplyData,
  ): Promise<{ partnerId: string; wasNew: boolean }> {
    const existing = await prisma.deliveryPartner.findFirst({
      where: { phone: phoneDigits, tenantId },
      select: { id: true, isActive: true },
    });

    if (existing) {
      await prisma.deliveryPartner.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          email: data.email,
          zone: data.zone,
          vehicleType: data.vehicleType,
          notes: data.kycNotesJson,
        },
      });
      return { partnerId: existing.id, wasNew: false };
    }

    const created = await prisma.deliveryPartner.create({
      data: {
        name: data.name,
        phone: phoneDigits,
        email: data.email,
        zone: data.zone,
        vehicleType: data.vehicleType,
        isActive: false,
        rating: 5.0,
        fee: 5.0,
        tenantId,
        notes: data.kycNotesJson,
      },
      select: { id: true },
    });
    return { partnerId: created.id, wasNew: true };
  },
};

/**
 * NotificationsDB — solo el subset usado por endpoints de aplicacion.
 * (No movemos toda la coleccion de notifications aqui — el archivo
 *  existente lib/db/notifications.db.ts cubre el resto.)
 */
export const AdminNotificationsDB = {
  /**
   * Crea una notification para el admin (severity MEDIUM por defecto).
   * Fire-and-forget OK: el caller puede ignorar errores no criticos.
   */
  async create(params: {
    tenantId: string;
    title: string;
    body: string;
    type: string;
    severity?: string;
  }): Promise<{ id: string } | null> {
    try {
      const row = await prisma.notification.create({
        data: {
          tenantId: params.tenantId,
          title: params.title,
          body: params.body,
          type: params.type,
          severity: params.severity ?? "MEDIUM",
        },
        select: { id: true },
      });
      return row;
    } catch (err) {
      logger.warn("[AdminNotificationsDB.create] failed", {
        tenantId: params.tenantId,
        type: params.type,
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  },
};
