import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * ExpensesDB
 *
 * Audit project-wide 2026-05-19 — migracion de /api/presupuesto y otros
 * endpoints que leen Expense para KPIs y agregados.
 */

export const ExpensesDB = {
  /**
   * Lista gastos de un tenant en un rango de fechas. Devuelve solo
   * category + amount (mapeado a number) para agregaciones rapidas.
   */
  async listByDateRange(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ category: string; amount: number }>> {
    const rows = await prisma.expense.findMany({
      where: {
        tenantId,
        date: { gte: from, lte: to },
      },
      select: { category: true, amount: true },
    });
    return rows.map((r) => ({
      category: r.category,
      amount: toNumOrZero(r.amount),
    }));
  },

  /**
   * Lista gastos del mes actual de un tenant. Wrapper conveniente.
   */
  async listCurrentMonth(tenantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return this.listByDateRange(tenantId, startOfMonth, endOfMonth);
  },
};
