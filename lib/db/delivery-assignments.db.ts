import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * DeliveryAssignmentsDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/delivery/assignments.
 * 7 queries CRUD con cross-tenant guards (audit 2026-05-05 CT-06 + pentest H010).
 */

type AssignmentFilters = {
  status?: string;
  partnerId?: string;
  date?: string;
};

export const DeliveryAssignmentsDB = {
  async listByTenant(tenantId: string, filters: AssignmentFilters) {
    const where: Record<string, unknown> = { tenantId };
    if (filters.status) where.status = filters.status;
    if (filters.partnerId) where.partnerId = filters.partnerId;
    if (filters.date) {
      const from = new Date(filters.date);
      from.setHours(0, 0, 0, 0);
      const to = new Date(filters.date);
      to.setHours(23, 59, 59, 999);
      where.createdAt = { gte: from, lte: to };
    }
    return prisma.deliveryAssignment.findMany({
      where,
      include: {
        order: { select: { id: true, customerName: true, total: true } },
        partner: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async findOrderInTenant(tenantId: string, orderId: string) {
    return prisma.order.findFirst({
      where: { id: orderId, tenantId },
    });
  },

  async findActivePartnerInTenant(tenantId: string, partnerId: string) {
    return prisma.deliveryPartner.findFirst({
      where: { id: partnerId, tenantId, isActive: true },
      select: { id: true },
    });
  },

  async findAssignmentByOrder(tenantId: string, orderId: string) {
    return prisma.deliveryAssignment.findFirst({ where: { tenantId, orderId } });
  },

  async createAssignment(data: {
    tenantId: string;
    orderId: string;
    partnerId: string;
    fee: number;
  }) {
    return prisma.deliveryAssignment.create({
      data,
      include: {
        order: { select: { id: true, customerName: true, total: true, customerLocation: true } },
        partner: { select: { id: true, name: true, phone: true } },
      },
    });
  },

  async findAssignmentInTenant(tenantId: string, id: string) {
    return prisma.deliveryAssignment.findFirst({
      where: { id, tenantId },
    });
  },

  /**
   * Todos los assignments ACTIVOS de un partner (pedidos apilados).
   * Devuelve las coords del Order para que el caller arme la ruta óptima.
   *
   * Scope = partnerId (NO tenantId): la sesión HMAC del repartidor prueba su
   * identidad y es la frontera de seguridad. Un repartidor puede tener pedidos
   * de varias tiendas, así que `assignment.tenantId` = tenant del pedido, no del
   * repartidor — filtrar por el tenant del repartidor devolvería vacío. Mismo
   * criterio que el endpoint auditado /api/delivery/me/current (audit #19).
   */
  async listActiveForPartner(partnerId: string) {
    return prisma.deliveryAssignment.findMany({
      where: {
        partnerId,
        status: { in: ["assigned", "picked_up", "in_transit"] },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        status: true,
        fee: true,
        tipAmount: true,
        createdAt: true,
        order: {
          select: {
            id: true,
            customerName: true,
            customerPhone: true,
            customerLocation: true,
            customerReference: true,
            total: true,
            dropoffLat: true,
            dropoffLng: true,
            items: { select: { name: true, quantity: true, unit: true } },
          },
        },
      },
    });
  },

  async updateAssignmentStatus(
    id: string,
    status: string,
    extra?: { deliveredAt?: Date },
  ) {
    return prisma.deliveryAssignment.update({
      where: { id },
      data: { status, ...(extra?.deliveredAt && { deliveredAt: extra.deliveredAt }) },
      include: {
        order: { select: { customerName: true, customerPhone: true } },
        partner: { select: { name: true } },
      },
    });
  },
};
