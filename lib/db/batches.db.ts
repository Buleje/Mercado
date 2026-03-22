// lib/db/batches.db.ts
// DB class for batch/lot management (FEFO inventory)
import { prisma } from "@/lib/prisma";

export class BatchesDB {
  /** Get batches expiring within N days */
  static async getExpiringBatches(tenantId: string, days: number = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + days);
    return prisma.batch.findMany({
      where: {
        tenantId,
        expiryDate: { lte: cutoffDate },
        quantity: { gt: 0 },
      },
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { expiryDate: "asc" },
    });
  }

  /** Get all active batches for a product (FEFO order) */
  static async getProductBatches(tenantId: string, productId: number) {
    return prisma.batch.findMany({
      where: { tenantId, productId, quantity: { gt: 0 } },
      orderBy: { expiryDate: "asc" },
    });
  }

  /** Get batch by ID */
  static async getById(tenantId: string, batchId: number) {
    return prisma.batch.findFirst({
      where: { id: batchId, tenantId },
      include: { product: { select: { id: true, name: true } } },
    });
  }

  /** Count total active batches */
  static async countActive(tenantId: string) {
    return prisma.batch.count({
      where: { tenantId, quantity: { gt: 0 } },
    });
  }

  /** Get expired batches with remaining stock */
  static async getExpiredWithStock(tenantId: string) {
    return prisma.batch.findMany({
      where: {
        tenantId,
        expiryDate: { lt: new Date() },
        quantity: { gt: 0 },
      },
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { expiryDate: "asc" },
    });
  }
}
