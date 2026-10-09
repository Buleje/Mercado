import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * CierreDiarioPreviewDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/cierre-diario/preview.
 * 7 queries paralelas para snapshot del día (POS + fiados + stock).
 */

export const CierreDiarioPreviewDB = {
  async aggregateSalesInRange(tenantId: string, gte: Date, lt: Date) {
    return prisma.sale.aggregate({
      where: { tenantId, createdAt: { gte, lt } },
      _sum: { total: true },
      _count: true,
      _avg: { total: true },
    });
  },

  async listSalesInRange(tenantId: string, gte: Date, lt: Date) {
    return prisma.sale.findMany({
      where: { tenantId, createdAt: { gte, lt } },
      select: { createdAt: true, total: true, payment: true },
    });
  },

  async topProductInRange(tenantId: string, gte: Date, lt: Date) {
    return prisma.saleItem.groupBy({
      by: ["productId"],
      where: { sale: { tenantId, createdAt: { gte, lt } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 1,
    });
  },

  async aggregateFiadoCuotasPaid(tenantId: string, gte: Date, lt: Date) {
    return prisma.fiadoCuota.aggregate({
      where: {
        fiado: { tenantId },
        pagadoEn: { gte, lt },
      },
      _sum: { monto: true },
    });
  },

  async aggregateNewFiados(tenantId: string, gte: Date, lt: Date) {
    return prisma.fiado.aggregate({
      where: { tenantId, createdAt: { gte, lt } },
      _sum: { total: true },
    });
  },

  async countOverdueFiados(tenantId: string) {
    return prisma.fiado.count({
      where: { tenantId, status: "VENCIDO" },
    });
  },

  /**
   * Productos en o bajo su stock mínimo para el cierre del día. Un solo stock
   * mínimo (09-10): el propio si lo tiene; si no, `Settings.globalMinStock`
   * (`minimoGlobal`, ver lib/inventario/stock-minimo). Antes era `lte: 5` para
   * todos: un producto con mínimo 20 y stock 10 no salía.
   */
  async listLowStockProducts(tenantId: string, minimoGlobal: number, take = 20) {
    return prisma.product.findMany({
      where: {
        tenantId,
        active: true,
        deletedAt: null,
        stock: { not: null },
        OR: [
          { stockMin: { not: null }, stock: { lte: prisma.product.fields.stockMin } },
          { stockMin: null, stock: { lte: minimoGlobal } },
        ],
      },
      select: { name: true, stock: true, stockMin: true },
      take,
    });
  },

  async findProductName(tenantId: string, productId: number) {
    return prisma.product.findFirst({
      where: { id: productId, tenantId },
      select: { name: true },
    });
  },
};
