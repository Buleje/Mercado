import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * CashShiftSalesDB
 *
 * Audit project-wide 2026-05-19 — migración de close-shift aggregate.
 * Endpoint /api/cash-registers/close-shift necesita sumar ventas del
 * cajero durante el turno activo (al cerrar caja).
 */

export const CashShiftSalesDB = {
  /**
   * Suma del total de ventas del cajero desde el inicio del turno.
   * Scope estricto: tenantId + cashierId + createdAt >= shiftStart.
   */
  async aggregateByCashierShift(
    tenantId: string,
    cashierId: string,
    shiftStart: Date,
  ): Promise<number> {
    const agg = await prisma.sale.aggregate({
      where: {
        tenantId,
        cashierId,
        createdAt: { gte: shiftStart },
      },
      _sum: { total: true },
    });
    return agg._sum.total ? Number(agg._sum.total) : 0;
  },
};
