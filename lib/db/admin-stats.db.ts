import "server-only";

/**
 * lib/db/admin-stats.db.ts
 *
 * Audit project-wide 2026-05-19: migracion de prisma directo en
 * app/api/admin/stats/route.ts a clase DB canonica (regla #1 CLAUDE.md).
 *
 * Todas las lecturas son paralelas (no transacciones) — seguras para
 * encapsular aqui. El raw SQL para stock <= stockMin se mantiene porque
 * Prisma no soporta comparacion columna-columna.
 */

import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";

export type AdminStatsPayload = {
  pendingOrders: number;
  oldPendingOrders: number;
  todayOrders: number;
  todayRevenue: number;
  lowStockProducts: number;
  weekOrders: number;
  totalCustomers: number;
  overduePayables: number;
  generatedAt: string;
};

export const AdminStatsDB = {
  /**
   * Devuelve los 8 contadores del header del admin panel.
   * Pensado para ser envuelto en getOrSet con TTL 30s en el route handler.
   *
   * @param tenantId  Tenant scope (obligatorio regla #3 CLAUDE.md)
   */
  async getHeaderStats(tenantId: string): Promise<AdminStatsPayload> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6); // rolling 7 days
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    const [
      pendingOrders,
      oldPendingOrders,
      todayOrders,
      todayRevenueResult,
      weekOrders,
      totalCustomers,
      overduePayables,
    ] = await withDbRetry(() =>
      Promise.all([
        // Pedidos activos en estado pendiente
         
        prisma.order.count({ where: { tenantId, status: "pendiente" } }),

        // Pedidos pendientes esperando > 30 minutos
         
        prisma.order.count({
          where: { tenantId, status: "pendiente", createdAt: { lt: thirtyMinutesAgo } },
        }),

        // Pedidos del dia
         
        prisma.order.count({ where: { tenantId, createdAt: { gte: startOfToday } } }),

        // Ingresos de pedidos ENTREGADOS hoy (no contabilizar revertibles)
         
        prisma.order.aggregate({
          _sum: { total: true },
          where: { tenantId, createdAt: { gte: startOfToday }, status: "entregado" },
        }),

        // Pedidos ultimos 7 dias
         
        prisma.order.count({ where: { tenantId, createdAt: { gte: startOfWeek } } }),

        // Total clientes
         
        prisma.customer.count({ where: { tenantId } }),

        // Cuentas por pagar vencidas (dueDate < ahora, no pagadas)
         
        prisma.payable.count({
          where: { tenantId, dueDate: { lt: now }, status: { not: "pagado" } },
        }),
      ])
    );

    // Productos bajo stock minimo: Prisma no soporta comparacion columna-columna,
    // se usa raw SQL parametrizado (regla #11 CLAUDE.md: $1/$2, no interpolacion).
     
    const lowStockResult = await withDbRetry(() =>
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM "Product"
        WHERE "tenantId" = ${tenantId}
          AND "active" = true
          AND "stock" IS NOT NULL
          AND "stockMin" IS NOT NULL
          AND "stock" <= "stockMin"
      `
    );
    const lowStockProducts = Number(lowStockResult[0]?.count ?? 0);

    return {
      pendingOrders,
      oldPendingOrders,
      todayOrders,
      todayRevenue: Number((todayRevenueResult._sum.total ?? 0).toFixed(2)),
      lowStockProducts,
      weekOrders,
      totalCustomers,
      overduePayables,
      generatedAt: now.toISOString(),
    };
  },
};
