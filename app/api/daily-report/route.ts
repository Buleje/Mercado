import { NextRequest, NextResponse } from "next/server";
import { SalesDB, CashRegistersDB } from "@/lib/db/sales.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { ProductsDB } from "@/lib/db/products.db";
import { CustomersDB } from "@/lib/db/customers.db";
import { requireAdmin } from "@/lib/require-admin";
import type { DailyReport } from "@/lib/daily-report";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;

  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDayISO = startOfDay.toISOString();

    // Obtener datos en paralelo
    const [allSales, allOrders, allProducts, allCustomers, openCash] = await Promise.all([
      SalesDB.getAll(tenantId),
      OrdersDB.getAllFiltered({ since: startOfDayISO, tenantId }),
      ProductsDB.getAll(tenantId),
      CustomersDB.getAll(tenantId),
      CashRegistersDB.getOpen(tenantId),
    ]);

    // Ventas del día desde POS
    const todaySales = allSales.filter(s => {
      return new Date(s.createdAt) >= startOfDay;
    });

    // Pedidos del día (ya filtrados por since)
    const activeOrders = allOrders.filter(o => {
      const status = (o.status ?? "").toLowerCase();
      return status !== "cancelado" && status !== "cancelled";
    });

    // Calcular totales de ventas POS
    const salesTotal = todaySales.reduce((sum, s) => sum + (s.total ?? 0), 0);
    const ordersTotal = activeOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);
    const totalSales = salesTotal + ordersTotal;
    const totalOrders = todaySales.length + activeOrders.length;
    const averageTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

    // Top productos desde ventas POS
    const productMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
    for (const sale of todaySales) {
      for (const item of sale.items ?? []) {
        const key = String(item.productId);
        if (!productMap[key]) productMap[key] = { name: item.name, quantity: 0, revenue: 0 };
        productMap[key].quantity += item.quantity ?? 0;
        productMap[key].revenue += (item.price ?? 0) * (item.quantity ?? 0);
      }
    }
    for (const order of activeOrders) {
      for (const item of order.items ?? []) {
        const key = String(item.id);
        if (!productMap[key]) productMap[key] = { name: item.name, quantity: 0, revenue: 0 };
        productMap[key].quantity += item.quantity ?? 0;
        productMap[key].revenue += (item.price ?? 0) * (item.quantity ?? 0);
      }
    }
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Métodos de pago desde ventas POS
    const paymentMethods: Record<string, number> = {};
    for (const sale of todaySales) {
      const method = (sale.payment ?? "otro").toLowerCase();
      paymentMethods[method] = (paymentMethods[method] ?? 0) + (sale.total ?? 0);
    }
    for (const order of activeOrders) {
      const method = (order.paymentMethod ?? "otro").toLowerCase();
      paymentMethods[method] = (paymentMethods[method] ?? 0) + (order.total ?? 0);
    }

    // Deliveries pendientes
    const pendingDeliveries = allOrders.filter(o => {
      const status = (o.status ?? "").toLowerCase();
      return status === "pendiente" || status === "en_camino" || status === "en camino";
    }).length;

    // Stock bajo
    const lowStockAlerts = allProducts.filter(p => {
      if (!p.active) return false;
      if (p.stock == null || p.stockMin == null) return false;
      return p.stock <= p.stockMin;
    }).length;

    // Clientes nuevos hoy
    let newCustomers = 0;
    if (Array.isArray(allCustomers)) {
      newCustomers = allCustomers.filter(c => {
        return c.createdAt && new Date(c.createdAt) >= startOfDay;
      }).length;
    }

    // Saldo en caja
    const cashBalance = openCash
      ? openCash.openingAmount + (openCash.movements ?? [])
          .filter(m => m.type === "venta" || m.type === "ingreso")
          .reduce((sum, m) => sum + m.amount, 0)
        - (openCash.movements ?? [])
          .filter(m => m.type === "egreso")
          .reduce((sum, m) => sum + m.amount, 0)
      : 0;

    // Ventas por hora del día (0-23)
    const salesByHour: number[] = Array(24).fill(0);
    for (const sale of todaySales) {
      const h = new Date(sale.createdAt).getHours();
      salesByHour[h] += sale.total ?? 0;
    }
    for (const order of activeOrders) {
      const h = new Date(order.createdAt).getHours();
      salesByHour[h] += order.total ?? 0;
    }

    // Comparación con la semana pasada (mismo día)
    const lastWeekDay = new Date(now);
    lastWeekDay.setDate(lastWeekDay.getDate() - 7);
    const lastWeekStart = new Date(lastWeekDay.getFullYear(), lastWeekDay.getMonth(), lastWeekDay.getDate());
    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 1);

    let lastWeekSales = 0;
    let lastWeekOrders = 0;
    try {
      const lwSales = allSales.filter(s => {
        const d = new Date(s.createdAt);
        return d >= lastWeekStart && d < lastWeekEnd;
      });
      lastWeekSales += lwSales.reduce((sum, s) => sum + (s.total ?? 0), 0);
      lastWeekOrders += lwSales.length;
    } catch { /* ignored */ }

    const dateLabel = now.toLocaleDateString("es-PE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    const report: DailyReport & { tenantId: string; salesByHour?: number[]; lastWeek?: { sales: number; orders: number } } = {
      tenantId,
      date: dateLabel,
      totalSales,
      totalOrders,
      averageTicket,
      topProducts,
      paymentMethods,
      pendingDeliveries,
      lowStockAlerts,
      newCustomers,
      cashBalance,
      salesByHour,
      lastWeek: { sales: lastWeekSales, orders: lastWeekOrders },
    };

    return NextResponse.json(report);
  } catch (err) {
    logger.error("[daily-report] GET error", {
      error: err instanceof Error ? err.message : String(err),
      tenantId,
    });
    return NextResponse.json({ error: "Error al generar reporte" }, { status: 500 });
  }
}
