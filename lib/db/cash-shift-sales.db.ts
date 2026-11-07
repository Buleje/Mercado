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
   *
   * Fix 2026-07-08 (reporte ventas-caja bug 3/6): `cashierIds` es un arreglo
   * porque `Sale.cashierId` guarda el `username` del cajero pero el turno se
   * identifica por `adminUserId` (CUID). El caller pasa AMBOS
   * (`[adminUserId, username]`) para que el `IN` capture las ventas sin
   * importar cuál forma se persistió (defensivo ante datos legados). Antes
   * recibía solo el adminUserId → sumaba S/0.00 siempre.
   */
  async aggregateByCashierShift(
    tenantId: string,
    cashierIds: string[],
    shiftStart: Date,
  ): Promise<number> {
    const ids = Array.from(new Set(cashierIds.filter(Boolean)));
    if (ids.length === 0) return 0;
    const agg = await prisma.sale.aggregate({
      where: {
        tenantId,
        cashierId: { in: ids },
        createdAt: { gte: shiftStart },
      },
      _sum: { total: true },
    });
    return agg._sum.total ? Number(agg._sum.total) : 0;
  },
};
