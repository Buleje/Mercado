import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * MeSpendingDB
 * Audit project-wide 2026-05-19 — migración de /api/me/spending-summary.
 *
 * Acceso canónico a Order + Customer para el resumen de gasto personal
 * del cliente autenticado. tenantId obligatorio como primer argumento
 * (CLAUDE.md regla #3). Incluye aislamiento multi-tenant explícito en
 * todas las queries.
 */
export const MeSpendingDB = {
  /**
   * Órdenes no canceladas de un customer en un rango de fechas,
   * incluyendo items para cálculo de top-productos.
   *
   * @param tenantId      tenant scope
   * @param customerPhone teléfono del cliente (Customer PK)
   * @param from          inicio del rango (inclusive)
   * @param to            fin del rango (exclusive, o "ahora" si se omite)
   */
  async getOrdersWithItems(
    tenantId: string,
    customerPhone: string,
    from: Date,
    to?: Date,
  ) {
    return prisma.order.findMany({
      where: {
        tenantId,
        customerPhone,
        createdAt: {
          gte: from,
          ...(to ? { lt: to } : {}),
        },
        status: { not: "cancelado" },
      },
      select: {
        total: true,
        items: {
          select: {
            name: true,
            price: true,
            quantity: true,
            productId: true,
          },
        },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Totales de pedidos (solo `total`) para el período anterior.
   * Se usa para calcular la tendencia de gasto vs. período actual.
   *
   * @param tenantId      tenant scope
   * @param customerPhone teléfono del cliente
   * @param from          inicio del período previo
   * @param to            fin del período previo
   */
  async getOrderTotals(
    tenantId: string,
    customerPhone: string,
    from: Date,
    to: Date,
  ) {
    return prisma.order.findMany({
      where: {
        tenantId,
        customerPhone,
        createdAt: { gte: from, lt: to },
        status: { not: "cancelado" },
      },
      select: { total: true },
    });
  },

  /**
   * Datos de lealtad y crédito del cliente para el panel de resumen.
   *
   * @param tenantId      tenant scope
   * @param customerPhone teléfono del cliente
   */
  async getLoyaltyData(tenantId: string, customerPhone: string) {
    return prisma.customer.findFirst({
      where: { phone: customerPhone, tenantId },
      select: {
        loyaltyPoints: true,
        loyaltyTier: true,
        totalSpent: true,
        creditBalance: true,
      },
    });
  },
};
