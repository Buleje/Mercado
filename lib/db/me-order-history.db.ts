/**
 * MeOrderHistoryDB — queries para el historial de pedidos del cliente.
 *
 * Audit project-wide 2026-05-19: migración de prisma.* directo a DB class.
 * Todas las queries incluyen tenantId como 1er argumento para aislamiento multi-tenant.
 */

import "server-only";
import { prisma } from "@/lib/prisma";

type OrderStatus =
  | "pendiente"
  | "confirmado"
  | "en_camino"
  | "entregado"
  | "cancelado";

interface OrderHistoryWhere {
  tenantId: string;
  customerPhone: string;
  status?: OrderStatus;
}

export const MeOrderHistoryDB = {
  /**
   * Lista paginada de pedidos del cliente, opcionalmente filtrada por status.
   * Incluye items completos para renderizado en /cuenta/pedidos.
   */
  async list(
    tenantId: string,
    customerPhone: string,
    options: {
      skip: number;
      take: number;
      statusFilter?: string;
    },
  ) {
    const where: OrderHistoryWhere = {
      tenantId,
      customerPhone,
      ...(options.statusFilter
        ? { status: options.statusFilter as OrderStatus }
        : {}),
    };

    return prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: options.skip,
      take: options.take,
      include: {
        items: {
          select: {
            name: true,
            price: true,
            quantity: true,
            unit: true,
            image: true,
            productId: true,
          },
        },
      },
    });
  },

  /**
   * Conteo total de pedidos del cliente (con mismo filtro que list).
   * Necesario para calcular totalPages en la paginación.
   */
  async count(
    tenantId: string,
    customerPhone: string,
    statusFilter?: string,
  ) {
    const where: OrderHistoryWhere = {
      tenantId,
      customerPhone,
      ...(statusFilter ? { status: statusFilter as OrderStatus } : {}),
    };

    return prisma.order.count({ where });
  },

  /**
   * Nombre y slug del tenant por su ID o slug.
   * Usado para mostrar el nombre real de la tienda en /cuenta/pedidos (QA P1 #1).
   */
  async getTenantName(tenantId: string) {
    return prisma.tenant.findFirst({
      where: { OR: [{ id: tenantId }, { slug: tenantId }] },
      select: { name: true, slug: true },
    });
  },
};
