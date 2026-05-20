import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * AnalyticsCashFlowDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/analytics/cash-flow.
 * 4 fuentes paralelas: sales + fiadoCuotas + expenses + payments.
 * Cada query con scope tenantId (directo o via relation).
 */

export const AnalyticsCashFlowDB = {
  /**
   * Ventas en rango (ingresos directos).
   */
  async getSalesInRange(tenantId: string, since: Date) {
    return prisma.sale.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { total: true, createdAt: true },
    });
  },

  /**
   * Cuotas de fiado pagadas en rango (ingresos por cobros).
   * tenantId scope via relation `fiado.tenantId`.
   */
  async getFiadoCuotasPaid(tenantId: string, since: Date) {
    return prisma.fiadoCuota.findMany({
      where: {
        pagadoEn: { not: null, gte: since },
        fiado: { tenantId },
      },
      select: { monto: true, pagadoEn: true },
    });
  },

  /**
   * Expenses en rango (egresos operativos).
   */
  async getExpensesInRange(tenantId: string, since: Date) {
    return prisma.expense.findMany({
      where: { tenantId, date: { gte: since } },
      select: { amount: true, date: true },
    });
  },

  /**
   * Pagos a proveedores en rango (egresos via payable).
   * tenantId scope via relation `payable.tenantId`.
   */
  async getSupplierPaymentsInRange(tenantId: string, since: Date) {
    return prisma.payment.findMany({
      where: {
        date: { gte: since },
        payable: { tenantId },
      },
      select: { amount: true, date: true },
    });
  },
};
