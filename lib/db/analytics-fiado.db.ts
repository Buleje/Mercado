import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * AnalyticsFiadoDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/analytics/fiado-analytics.
 * 4 queries para totales/aging/trend/topDeudores. Scope tenantId directo
 * en Fiado, via relation `fiado.tenantId` en FiadoCuota.
 */

export const AnalyticsFiadoDB = {
  /**
   * Fiados activos con info del customer — usado para totales, aging y top deudores.
   */
  async getActiveFiadosWithCustomer(tenantId: string) {
    return prisma.fiado.findMany({
      where: { tenantId, status: "ACTIVO" },
      select: {
        id: true,
        saldo: true,
        total: true,
        fechaVence: true,
        createdAt: true,
        customer: { select: { name: true, phone: true } },
      },
    });
  },

  /**
   * Suma de cuotas cobradas en un rango (default = mes actual).
   * tenantId scope via relation `fiado.tenantId`.
   */
  async aggregateCuotasPaidSince(tenantId: string, since: Date) {
    return prisma.fiadoCuota.aggregate({
      where: {
        pagadoEn: { gte: since },
        fiado: { tenantId },
      },
      _sum: { monto: true },
    });
  },

  /**
   * Nuevos fiados creados en rango — para trend 12 meses.
   */
  async getNewFiadosInRange(tenantId: string, since: Date) {
    return prisma.fiado.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { total: true, createdAt: true },
    });
  },

  /**
   * Cuotas pagadas en rango — para trend 12 meses (cobros).
   * tenantId scope via relation.
   */
  async getPaidCuotasInRange(tenantId: string, since: Date) {
    return prisma.fiadoCuota.findMany({
      where: {
        pagadoEn: { not: null, gte: since },
        fiado: { tenantId },
      },
      select: { monto: true, pagadoEn: true },
    });
  },
};
