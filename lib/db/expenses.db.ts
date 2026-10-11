import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { claveDeComprobante, gastoConMismoComprobante, type GastoConMismoComprobante } from "@/lib/gastos/factura-repetida";

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

  /**
   * El gasto de ESTE negocio que ya tiene el comprobante `ruc` + `numero`
   * (comparado sin ceros a la izquierda en el correlativo), o `null`. Sin
   * caché a propósito: el que se anotó hace un segundo tiene que aparecer.
   */
  async comprobanteRepetido(tenantId: string, ruc: string, numero: string, tipo?: string | null): Promise<GastoConMismoComprobante | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const clave = claveDeComprobante(numero);
    if (!ruc.trim() || !clave) return null;
    const filas = await prisma.expense.findMany({
      where: { tenantId, supplierRuc: ruc.trim(), documentNumber: { not: null } },
      select: { id: true, date: true, amount: true, description: true, documentType: true, documentNumber: true },
      orderBy: { date: "desc" },
      take: 500,
    });
    // El mismo número en OTRO tipo de papel (recibo por honorarios E001-5 vs factura E001-5) no
    // es la misma factura (reviewer 11-10); sin tipo en alguno de los dos, se compara igual.
    const igual = filas.find(
      (f) => claveDeComprobante(f.documentNumber) === clave && (!tipo || !f.documentType || f.documentType === tipo),
    );
    return igual ? gastoConMismoComprobante(igual) : null;
  },
};
