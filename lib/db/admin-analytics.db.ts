/**
 * lib/db/admin-analytics.db.ts
 *
 * DB class para analíticas de órdenes del panel admin.
 * Audit project-wide 2026-05-19 — migración regla #1 CLAUDE.md.
 *
 * Responsabilidades:
 *  - Agregación de ingresos y conteo de órdenes por período
 *  - Comparación período actual vs. período anterior (delta 30d)
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@/lib/generated/prisma/client";

export type OrderPeriodAgg = {
  revenue: number;
  count: number;
};

export class AdminAnalyticsDB {
  /**
   * Agrega ingresos y conteo de órdenes para un rango de fechas.
   * Solo estados en `statuses` cuentan como ventas confirmadas.
   *
   * @param tenantId  — aislamiento multi-tenant (siempre 1er argumento)
   * @param from      — inicio del período (inclusive)
   * @param to        — fin del período (exclusivo). Si undefined → hasta ahora.
   * @param statuses  — estados válidos (default: ["entregado"])
   */
  static async getOrderAgg(
    tenantId: string,
    from: Date,
    to?: Date,
    statuses: OrderStatus[] = ["entregado"],
  ): Promise<OrderPeriodAgg> {
    const raw = await prisma.order.aggregate({
      where: {
        tenantId,
        status: { in: statuses },
        createdAt: {
          gte: from,
          ...(to ? { lt: to } : {}),
        },
      },
      _sum: { total: true },
      _count: true,
    });

    // Prisma devuelve Decimal para campos Decimal — convertir a number
    const revenue = raw._sum?.total ? Number(raw._sum.total) : 0;
    // _count: true retorna el total de registros directamente como number
    const count = typeof raw._count === "number" ? raw._count : 0;

    return { revenue, count };
  }
}
