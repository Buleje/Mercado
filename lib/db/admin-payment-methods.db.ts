/**
 * lib/db/admin-payment-methods.db.ts
 *
 * Audit project-wide 2026-05-19 — migración regla #1 CLAUDE.md.
 *
 * Agrega ingresos por método de pago usando GROUP BY en Postgres.
 * tenantId siempre primer parámetro (regla #3 CLAUDE.md).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

export interface PaymentMethodRow {
  method: string;
  count: number;
  total: number;
}

export const AdminPaymentMethodsDB = {
  /**
   * Agrupa órdenes del tenant por paymentMethod en un rango de días.
   *
   * Delega COUNT + SUM a Postgres (1 query, O(grupos) memoria).
   * Equivalente al findMany+loop manual anterior pero sin OOM risk.
   *
   * @param tenantId     — aislamiento multi-tenant (1er argumento)
   * @param since        — fecha de corte (gte)
   * @param validStatuses — estados que cuentan como venta confirmada
   */
  async groupByPaymentMethod(
    tenantId: string,
    since: Date,
    validStatuses: string[] = ["entregado"],
  ): Promise<PaymentMethodRow[]> {
    const grouped = await prisma.order.groupBy({
      by: ["paymentMethod"],
      where: {
        tenantId,
        status: { in: validStatuses as never[] },
        createdAt: { gte: since },
      },
      _count: { _all: true },
      _sum: { total: true },
    });

    return grouped.map((g) => ({
      method: g.paymentMethod ?? "sin_especificar",
      count: g._count._all,
      total: toNumOrZero(g._sum.total),
    }));
  },
};
