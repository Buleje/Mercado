/**
 * AdminDriverApplicationsDB — acceso canónico a solicitudes de repartidor.
 * Audit project-wide 2026-05-19: migración desde prisma directo en
 * app/api/admin/driver-applications/route.ts.
 *
 * Opera sobre los modelos Notification (tipo DRIVER_APPLICATION) y
 * DeliveryPartner. No modifica lib/db/delivery-partners.db.ts (reservado
 * para otro agente). Este archivo encapsula solo las queries necesarias
 * para el flujo de aprobación/rechazo de solicitudes.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DriverApplicationNotification = {
  id: string;
  tenantId: string;
  type: string;
  body: string | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DriverApplicationPartner = {
  id: string;
  phone: string;
  isActive: boolean;
  notes: string | null;
  vehicleType: string | null;
  zone: string | null;
};

// ── AdminDriverApplicationsDB ─────────────────────────────────────────────────

export const AdminDriverApplicationsDB = {
  /**
   * Lista las últimas 50 notificaciones de solicitud de repartidor del tenant.
   */
  async listApplications(tenantId: string): Promise<DriverApplicationNotification[]> {
    const rows = await prisma.notification.findMany({
      where: { tenantId, type: "DRIVER_APPLICATION" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows as unknown as DriverApplicationNotification[];
  },

  /**
   * Busca DeliveryPartners por teléfono dentro del tenant.
   * Usado para enriquecer el listado con datos KYC.
   */
  async getPartnersByPhones(
    tenantId: string,
    phones: string[],
  ): Promise<DriverApplicationPartner[]> {
    if (phones.length === 0) return [];
    const rows = await prisma.deliveryPartner.findMany({
      where: { tenantId, phone: { in: phones } },
      select: { id: true, phone: true, isActive: true, notes: true, vehicleType: true, zone: true },
    });
    return rows as unknown as DriverApplicationPartner[];
  },

  /**
   * Marca la notificación como leída (readAt = now) para el tenant dado.
   * Retorna la notificación actualizada.
   */
  async markNotificationRead(
    tenantId: string,
    notificationId: string,
  ): Promise<DriverApplicationNotification> {
    const row = await prisma.notification.update({
      where: { id: notificationId, tenantId },
      data: { readAt: new Date() },
    });
    return row as unknown as DriverApplicationNotification;
  },

  /**
   * Busca un DeliveryPartner por teléfono dentro del tenant.
   * Retorna solo los campos necesarios para el flujo de aprobación.
   */
  async findPartnerByPhone(
    tenantId: string,
    phone: string,
  ): Promise<Pick<DriverApplicationPartner, "id" | "notes" | "phone"> | null> {
    return prisma.deliveryPartner.findFirst({
      where: { tenantId, phone },
      select: { id: true, notes: true, phone: true },
    });
  },

  /**
   * Activa un DeliveryPartner existente y actualiza sus notes (KYC + status).
   */
  async approvePartner(
    partnerId: string,
    updatedNotes: string | null,
  ): Promise<void> {
    await prisma.deliveryPartner.update({
      where: { id: partnerId },
      data: {
        isActive: true,
        ...(updatedNotes !== null ? { notes: updatedNotes } : {}),
      },
    });
  },

  /**
   * Fallback legacy: crea un DeliveryPartner si no existe aún.
   * Solo se ejecuta cuando el form de inscripción nuevo no creó el partner.
   */
  async createPartnerFallback(
    tenantId: string,
    name: string,
    phone: string,
  ): Promise<{ id: string } | null> {
    return prisma.deliveryPartner
      .create({
        data: {
          name,
          phone,
          zone: "Sin zona",
          vehicleType: "moto",
          tenantId,
          isActive: true,
        },
        select: { id: true },
      })
      .catch(() => null);
  },

  /**
   * Rechaza un DeliveryPartner: isActive = false + status en notes.
   */
  async rejectPartner(
    partnerId: string,
    updatedNotes: string,
  ): Promise<void> {
    await prisma.deliveryPartner.update({
      where: { id: partnerId },
      data: { isActive: false, notes: updatedNotes },
    });
  },
};
