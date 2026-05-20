import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * InventoryStockAlertsDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/inventory/stock-alerts.
 * 4 tipos de alertas: sinStock, stockCritico, sinMovimiento, porVencer.
 */

export const InventoryStockAlertsDB = {
  async listOutOfStockProducts(tenantId: string, take = 100) {
    return prisma.product.findMany({
      where: { tenantId, active: true, deletedAt: null, stock: 0 },
      select: { id: true, name: true, category: true },
      orderBy: { name: "asc" },
      take,
    });
  },

  async listActiveProductsWithStock(tenantId: string) {
    return prisma.product.findMany({
      where: { tenantId, active: true, deletedAt: null, stock: { gt: 0 } },
      select: { id: true, name: true, stock: true, stockMin: true, category: true },
      orderBy: { name: "asc" },
    });
  },

  async listExpiringBatches(tenantId: string, fromDate: Date, toDate: Date, take = 100) {
    return prisma.batch.findMany({
      where: {
        tenantId,
        expiryDate: { lte: toDate, gte: fromDate },
        quantity: { gt: 0 },
      },
      select: {
        id: true,
        productName: true,
        lote: true,
        expiryDate: true,
        quantity: true,
        productId: true,
      },
      orderBy: { expiryDate: "asc" },
      take,
    });
  },

  async lastSalesForProducts(tenantId: string, productIds: number[]) {
    if (productIds.length === 0) return [];
    return prisma.saleItem.findMany({
      where: { productId: { in: productIds }, sale: { tenantId } },
      select: { productId: true, sale: { select: { createdAt: true } } },
      orderBy: { sale: { createdAt: "desc" } },
    });
  },

  async recentSoldProductIds(tenantId: string, productIds: number[], since: Date) {
    if (productIds.length === 0) return [];
    return prisma.saleItem.findMany({
      where: {
        productId: { in: productIds },
        sale: { createdAt: { gte: since }, tenantId },
      },
      select: { productId: true },
      distinct: ["productId"],
    });
  },

  async productsWithCost(tenantId: string, productIds: number[]) {
    if (productIds.length === 0) return [];
    return prisma.product.findMany({
      where: { id: { in: productIds }, tenantId },
      select: { id: true, name: true, stock: true, costPrice: true, category: true },
    });
  },
};
