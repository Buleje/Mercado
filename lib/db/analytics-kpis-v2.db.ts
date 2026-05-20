import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * AnalyticsKpisV2DB
 *
 * Audit project-wide 2026-05-19 — migración de /api/analytics/kpis-v2.
 * 13 queries paralelas distribuidas en 6 KPIs:
 *   KPI 1: ingresos hoy + sparkline 7d (9 sale.aggregate)
 *   KPI 2: ticket promedio 30d vs 30d-ant (2 sale.aggregate)
 *   KPI 3: margen operativo (1 sale.aggregate + 1 saleItem.findMany)
 *   KPI 4: clientes activos (2 sale.findMany distinct)
 *   KPI 5: fiado pendiente (1 fiado.aggregate + 1 fiado.count)
 *   KPI 6: rotación inventario (1 saleItem.findMany + 1 product.findMany)
 */

export const AnalyticsKpisV2DB = {
  // ─── KPI 1 helpers ──────────────────────────────────────────────────

  async ingresosForRange(tenantId: string, gte: Date, lt?: Date) {
    return prisma.sale.aggregate({
      where: { tenantId, createdAt: lt ? { gte, lt } : { gte } },
      _sum: { total: true },
    });
  },

  // ─── KPI 2 helpers ──────────────────────────────────────────────────

  async ticketAvg(tenantId: string, gte: Date, lt?: Date) {
    return prisma.sale.aggregate({
      where: { tenantId, createdAt: lt ? { gte, lt } : { gte } },
      _avg: { total: true },
      _count: { id: true },
    });
  },

  // ─── KPI 3 helpers ──────────────────────────────────────────────────

  async saleItemsForCogs(tenantId: string, since: Date) {
    return prisma.saleItem.findMany({
      where: { sale: { tenantId, createdAt: { gte: since } } },
      select: {
        costPrice: true,
        quantity: true,
        product: { select: { costPrice: true } },
      },
    });
  },

  // ─── KPI 4 helpers ──────────────────────────────────────────────────

  async distinctCustomersInRange(tenantId: string, gte: Date, lt?: Date) {
    return prisma.sale.findMany({
      where: {
        tenantId,
        createdAt: lt ? { gte, lt } : { gte },
        customerPhone: { not: null },
      },
      select: { customerPhone: true },
      distinct: ["customerPhone"],
    });
  },

  // ─── KPI 5 helpers ──────────────────────────────────────────────────

  async aggregateFiadoActive(tenantId: string) {
    return prisma.fiado.aggregate({
      where: { tenantId, status: "ACTIVO" },
      _sum: { saldo: true },
      _count: { id: true },
    });
  },

  async countFiadoVencidos(tenantId: string, now: Date) {
    return prisma.fiado.count({
      where: { tenantId, status: "ACTIVO", fechaVence: { lt: now } },
    });
  },

  // ─── KPI 6 helpers ──────────────────────────────────────────────────

  async productsForInventoryValue(tenantId: string) {
    return prisma.product.findMany({
      where: {
        tenantId,
        active: true,
        deletedAt: null,
        stock: { not: null },
        costPrice: { not: null },
      },
      select: { stock: true, costPrice: true },
    });
  },
};
