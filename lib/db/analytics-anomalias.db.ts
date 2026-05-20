import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * AnalyticsAnomaliasDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/analytics/anomalias.
 * Detecta 4 tipos de anomalías de negocio en paralelo.
 */

export const AnalyticsAnomaliasDB = {
  /**
   * Suma de ventas en un rango (1-shot day o sameWeekday).
   */
  async aggregateSalesInRange(tenantId: string, gte: Date, lt?: Date) {
    return prisma.sale.aggregate({
      where: { tenantId, createdAt: lt ? { gte, lt } : { gte } },
      _sum: { total: true },
    });
  },

  /**
   * Productos activos con stock > 0 — para detección de stock muerto.
   */
  async listProductsWithStock(tenantId: string) {
    return prisma.product.findMany({
      where: {
        tenantId,
        active: true,
        deletedAt: null,
        stock: { gt: 0 },
      },
      select: { id: true, name: true, stock: true, category: true },
    });
  },

  /**
   * Productos con precio y costo definidos — para análisis de margen crítico.
   */
  async listProductsWithMargin(tenantId: string) {
    return prisma.product.findMany({
      where: {
        tenantId,
        active: true,
        deletedAt: null,
        costPrice: { not: null, gt: 0 },
        price: { gt: 0 },
      },
      select: { id: true, name: true, price: true, costPrice: true, category: true },
    });
  },

  /**
   * Distinct productIds vendidos en un rango. Cross-tenant guard vía sale.tenantId.
   */
  async getRecentlySoldProductIds(tenantId: string, productIds: number[], since: Date) {
    return prisma.saleItem.findMany({
      where: {
        productId: { in: productIds },
        sale: { tenantId, createdAt: { gte: since } },
      },
      select: { productId: true },
      distinct: ["productId"],
    });
  },

  /**
   * Top 5 fiados vencidos hace más de N días, con customer.
   */
  async getOverdueFiados(tenantId: string, before: Date, limit = 5) {
    return prisma.fiado.findMany({
      where: {
        tenantId,
        status: "ACTIVO",
        fechaVence: { lt: before },
      },
      select: {
        id: true,
        saldo: true,
        fechaVence: true,
        customer: { select: { name: true, phone: true } },
      },
      orderBy: { saldo: "desc" },
      take: limit,
    });
  },
};
