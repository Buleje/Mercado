/**
 * MeDashboardDB — queries para el dashboard personal del cliente.
 *
 * Audit project-wide 2026-05-19: migración de prisma.* directo a DB class.
 * Todas las queries incluyen tenantId como 1er argumento para aislamiento multi-tenant.
 */

import "server-only";
import { prisma } from "@/lib/prisma";

export const MeDashboardDB = {
  /**
   * Perfil del cliente. Usa findFirst (no findUnique) porque phone es PK
   * global y findUnique ignoraría el tenantId → posible cross-tenant leak.
   */
  async getCustomerProfile(tenantId: string, customerPhone: string) {
    return prisma.customer.findFirst({
      where: { phone: customerPhone, tenantId },
      select: {
        name: true,
        phone: true,
        loyaltyPoints: true,
        loyaltyTier: true,
        totalSpent: true,
        creditBalance: true,
        creditLimit: true,
        referralCode: true,
        createdAt: true,
      },
    });
  },

  /**
   * Últimos N pedidos del cliente con items preview (hasta 3 por pedido).
   */
  async getRecentOrders(
    tenantId: string,
    customerPhone: string,
    take = 5,
  ) {
    return prisma.order.findMany({
      where: { tenantId, customerPhone },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        items: {
          select: { name: true, quantity: true },
          take: 3,
        },
      },
    });
  },

  /**
   * Agregado de pedidos del cliente en los últimos 30 días (excluye cancelados).
   */
  async getMonthlyAggregate(
    tenantId: string,
    customerPhone: string,
    since: Date,
  ) {
    return prisma.order.aggregate({
      where: {
        tenantId,
        customerPhone,
        createdAt: { gte: since },
        status: { not: "cancelado" },
      },
      _sum: { total: true },
      _count: true,
    });
  },

  /**
   * Carrito guardado más reciente del cliente (si existe).
   */
  async getSavedCart(tenantId: string, customerPhone: string) {
    return prisma.savedCart.findFirst({
      where: { tenantId, customerPhone },
      select: { itemsJson: true, updatedAt: true },
    });
  },

  /**
   * Pedidos con deuda (fiado) pendientes de pago — últimos N.
   */
  async getPendingDeuda(
    tenantId: string,
    customerPhone: string,
    take = 5,
  ) {
    return prisma.order.findMany({
      where: {
        tenantId,
        customerPhone,
        deuda: true,
      },
      select: { id: true, total: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take,
    });
  },
};
