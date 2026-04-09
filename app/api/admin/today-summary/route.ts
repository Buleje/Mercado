import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";

/**
 * GET /api/admin/today-summary
 *
 * Resumen ejecutivo del día: ventas, pedidos, alertas, stock bajo.
 * Usado por el widget "Mi Negocio Hoy" en el admin.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await getOrSet(
      `today-summary:${auth.tenantId}`,
      120, // 2 min TTL
      async () => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterdayStart = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000);

        // Today's sales
        const todaySales = await prisma.sale.aggregate({
          where: {
            tenantId: auth.tenantId,
            createdAt: { gte: startOfDay },
          },
          _sum: { total: true },
          _count: true,
        });

        // Yesterday's sales (for comparison)
        const yesterdaySales = await prisma.sale.aggregate({
          where: {
            tenantId: auth.tenantId,
            createdAt: { gte: yesterdayStart, lt: startOfDay },
          },
          _sum: { total: true },
          _count: true,
        });

        // Today's online orders
        const todayOrders = await prisma.order.aggregate({
          where: {
            tenantId: auth.tenantId,
            createdAt: { gte: startOfDay },
          },
          _sum: { total: true },
          _count: true,
        });

        // Pending orders (need attention)
        const pendingOrders = await prisma.order.count({
          where: {
            tenantId: auth.tenantId,
            status: "pendiente",
          },
        });

        // Low stock products
        const lowStockProducts = await prisma.product.count({
          where: {
            tenantId: auth.tenantId,
            active: true,
            deletedAt: null,
            stock: { lte: 5, gt: 0 },
          },
        });

        // Out of stock products
        const outOfStockProducts = await prisma.product.count({
          where: {
            tenantId: auth.tenantId,
            active: true,
            deletedAt: null,
            stock: { lte: 0 },
          },
        });

        // Products expiring within 7 days
        const expiringBatches = await prisma.batch.count({
          where: {
            tenantId: auth.tenantId,
            quantity: { gt: 0 },
            expiryDate: {
              gte: now,
              lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            },
          },
        });

        // Today's top product
        const topProductToday = await prisma.saleItem.groupBy({
          by: ["name"],
          where: {
            sale: {
              tenantId: auth.tenantId,
              createdAt: { gte: startOfDay },
            },
          },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 1,
        });

        const todayTotal = Number(todaySales._sum.total ?? 0);
        const yesterdayTotal = Number(yesterdaySales._sum.total ?? 0);
        const orderTotal = Number(todayOrders._sum.total ?? 0);

        const salesChange = yesterdayTotal > 0
          ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100)
          : todayTotal > 0 ? 100 : 0;

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
            totalAlertas: lowStockProducts + outOfStockProducts + expiringBatches + pendingOrders,
          },
          topProducto: topProductToday[0]
            ? { nombre: topProductToday[0].name, cantidad: topProductToday[0]._sum.quantity ?? 0 }
            : null,
          generadoA: now.toISOString(),
        };
      },
    );

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
