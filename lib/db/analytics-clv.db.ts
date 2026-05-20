import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * lib/db/analytics-clv.db.ts
 *
 * Audit project-wide 2026-05-19 — migración de prisma directo a DB class.
 * Customer Lifetime Value: agrega órdenes no canceladas por teléfono de cliente,
 * retorna datos raw para que el route handler calcule los KPIs de CLV y cohortes.
 *
 * Todas las queries scopean por tenantId (regla #3 CLAUDE.md).
 */

export type CLVRawRow = {
  customerPhone: string;
  totalSpent: number | null;
  orderCount: number;
};

export type CLVDateRow = {
  customerPhone: string;
  minDate: Date | null;
  maxDate: Date | null;
};

export type CLVCustomerName = {
  phone: string;
  name: string;
};

export const AnalyticsCLVDB = {
  /**
   * Agrega ventas (no canceladas) por teléfono de cliente para CLV.
   * @param tenantId — Scope multi-tenant obligatorio.
   */
  async getOrderAggregatesByPhone(tenantId: string): Promise<CLVRawRow[]> {
    const rows = await prisma.order.groupBy({
      by: ["customerPhone"],
      where: {
        tenantId,
        status: { not: "cancelado" },
        customerPhone: { not: null },
      },
      _sum: { total: true },
      _count: { id: true },
    });

    return rows.map((r) => ({
      customerPhone: r.customerPhone as string,
      totalSpent: r._sum.total !== null ? Number(r._sum.total) : null,
      orderCount: r._count.id,
    }));
  },

  /**
   * Obtiene primera y última fecha de orden por teléfono (no canceladas).
   * @param tenantId — Scope multi-tenant obligatorio.
   * @param phones   — Lista de teléfonos a consultar.
   */
  async getOrderDateRangesByPhone(
    tenantId: string,
    phones: string[]
  ): Promise<{ firstOrders: CLVDateRow[]; lastOrders: CLVDateRow[] }> {
    const [firstRows, lastRows] = await Promise.all([
      prisma.order.groupBy({
        by: ["customerPhone"],
        where: {
          tenantId,
          status: { not: "cancelado" },
          customerPhone: { in: phones },
        },
        _min: { createdAt: true },
      }),
      prisma.order.groupBy({
        by: ["customerPhone"],
        where: {
          tenantId,
          status: { not: "cancelado" },
          customerPhone: { in: phones },
        },
        _max: { createdAt: true },
      }),
    ]);

    return {
      firstOrders: firstRows.map((r) => ({
        customerPhone: r.customerPhone as string,
        minDate: r._min.createdAt,
        maxDate: null,
      })),
      lastOrders: lastRows.map((r) => ({
        customerPhone: r.customerPhone as string,
        minDate: null,
        maxDate: r._max.createdAt,
      })),
    };
  },

  /**
   * Carga nombres de clientes por teléfono (para enriquecer resultados CLV).
   * @param tenantId — Scope multi-tenant obligatorio.
   * @param phones   — Lista de teléfonos a consultar.
   */
  async getCustomerNamesByPhone(
    tenantId: string,
    phones: string[]
  ): Promise<CLVCustomerName[]> {
    return prisma.customer.findMany({
      where: { tenantId, phone: { in: phones } },
      select: { phone: true, name: true },
    });
  },
};
