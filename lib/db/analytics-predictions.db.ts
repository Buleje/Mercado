import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * AnalyticsPredictionsDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/analytics/predictions.
 * Predicciones simples basadas en promedios y tendencias históricas.
 * Solo encapsula las queries Prisma — los cálculos de proyección,
 * trend factor, stock risk y churn quedan en el route handler.
 */

export const AnalyticsPredictionsDB = {
  /**
   * Ventas con items de los últimos N días (tenant scope).
   */
  async getSalesWithItems(tenantId: string, since: Date) {
    return prisma.sale.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: {
        total: true,
        createdAt: true,
        items: { select: { productId: true, quantity: true } },
      },
    });
  },

  /**
   * Agregado de ventas en un rango (sum + count). Tenant scope.
   */
  async aggregateSales(tenantId: string, since: Date) {
    return prisma.sale.aggregate({
      where: { tenantId, createdAt: { gte: since } },
      _sum: { total: true },
      _count: true,
    });
  },

  /**
   * Productos activos con stock > 0, ordenados por stock asc.
   */
  async getProductsLowStock(tenantId: string, take = 20) {
    return prisma.product.findMany({
      where: { tenantId, active: true, stock: { gt: 0 } },
      select: { id: true, name: true, stock: true, image: true },
      orderBy: { stock: "asc" },
      take,
    });
  },

  /**
   * Clientes en riesgo de churn — última orden previa al cutoff,
   * sin orders posteriores al cutoff.
   */
  async getChurnableCustomers(tenantId: string, cutoff: Date, take = 10) {
    return prisma.customer.findMany({
      where: {
        tenantId,
        orders: {
          some: { createdAt: { lt: cutoff }, deletedAt: null },
          none: { createdAt: { gte: cutoff }, deletedAt: null },
        },
      },
      select: {
        name: true,
        phone: true,
        orders: {
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      take,
    });
  },
};
