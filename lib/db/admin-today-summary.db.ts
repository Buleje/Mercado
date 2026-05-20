/**
 * lib/db/admin-today-summary.db.ts
 *
 * Audit project-wide 2026-05-19 — migración de app/api/admin/today-summary/route.ts.
 * Antes: 7 prisma.* directos inline en el route handler.
 * Ahora: clase canónica con guard cross-tenant + tenantId primer argumento.
 *
 * Lógica preservada íntegra: ventas mostrador + online, pedidos pendientes,
 * stock bajo/sin stock, lotes por vencer, top producto del día.
 *
 * El cache (TTL 120s) sigue en el route handler via getOrSet — esta clase
 * solo expone la lógica de datos pura para facilitar testing unitario.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

export type TodaySummaryPayload = {
  ventas: {
    total: number;
    ventasMostrador: number;
    ventasOnline: number;
    cantidadVentas: number;
    cambioVsAyer: number;
  };
  pedidos: {
    hoy: number;
    pendientes: number;
  };
  alertas: {
    stockBajo: number;
    sinStock: number;
    porVencer: number;
    totalAlertas: number;
  };
  topProducto: { nombre: string; cantidad: number } | null;
  generadoA: string;
};

export const AdminTodaySummaryDB = {
  /**
   * Compila el resumen ejecutivo del día para el widget "Mi Negocio Hoy".
   * Guard: todas las queries filtran por tenantId — nunca mezcla datos entre tenants.
   *
   * @param tenantId  ID del tenant autenticado
   * @returns TodaySummaryPayload listo para serializar como JSON
   */
  async getSummaryForTenant(tenantId: string): Promise<TodaySummaryPayload> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000);

    const [
      todaySales,
      yesterdaySales,
      todayOrders,
      pendingOrders,
      lowStockProducts,
      outOfStockProducts,
      expiringBatches,
      topProductToday,
    ] = await Promise.all([
      // Ventas mostrador de hoy
      prisma.sale.aggregate({
        where: { tenantId, createdAt: { gte: startOfDay } },
        _sum: { total: true },
        _count: true,
      }),
      // Ventas mostrador de ayer (comparación)
      prisma.sale.aggregate({
        where: { tenantId, createdAt: { gte: yesterdayStart, lt: startOfDay } },
        _sum: { total: true },
        _count: true,
      }),
      // Pedidos online de hoy
      prisma.order.aggregate({
        where: { tenantId, createdAt: { gte: startOfDay } },
        _sum: { total: true },
        _count: true,
      }),
      // Pedidos pendientes (requieren atención)
      prisma.order.count({
        where: { tenantId, status: "pendiente" },
      }),
      // Productos con stock bajo (1–5)
      prisma.product.count({
        where: { tenantId, active: true, deletedAt: null, stock: { lte: 5, gt: 0 } },
      }),
      // Productos sin stock
      prisma.product.count({
        where: { tenantId, active: true, deletedAt: null, stock: { lte: 0 } },
      }),
      // Lotes por vencer en 7 días
      prisma.batch.count({
        where: {
          tenantId,
          quantity: { gt: 0 },
          expiryDate: {
            gte: now,
            lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      // Top producto vendido hoy
      prisma.saleItem.groupBy({
        by: ["name"],
        where: { sale: { tenantId, createdAt: { gte: startOfDay } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 1,
      }),
    ]);

    const todayTotal = Number(todaySales._sum.total ?? 0);
    const yesterdayTotal = Number(yesterdaySales._sum.total ?? 0);
    const orderTotal = Number(todayOrders._sum.total ?? 0);

    const salesChange =
      yesterdayTotal > 0
        ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100)
        : todayTotal > 0
          ? 100
          : 0;

    return {
      ventas: {
        total: todayTotal + orderTotal,
        ventasMostrador: todayTotal,
        ventasOnline: orderTotal,
        cantidadVentas: todaySales._count + todayOrders._count,
        cambioVsAyer: salesChange,
      },
      pedidos: {
        hoy: todayOrders._count,
        pendientes: pendingOrders,
      },
      alertas: {
        stockBajo: lowStockProducts,
        sinStock: outOfStockProducts,
        porVencer: expiringBatches,
        totalAlertas:
          lowStockProducts + outOfStockProducts + expiringBatches + pendingOrders,
      },
      topProducto: topProductToday[0]
        ? {
            nombre: topProductToday[0].name,
            cantidad: topProductToday[0]._sum.quantity ?? 0,
          }
        : null,
      generadoA: now.toISOString(),
    };
  },
};
