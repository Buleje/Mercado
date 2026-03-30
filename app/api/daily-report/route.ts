import { NextResponse } from "next/server";
import { SalesDB, CashRegistersDB } from "@/lib/db/sales.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { ProductsDB } from "@/lib/db/products.db";
import { CustomersDB } from "@/lib/db/customers.db";
import type { DailyReport } from "@/lib/daily-report";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") ?? "default";

  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDayISO = startOfDay.toISOString();

    // Obtener datos en paralelo
    const [allSales, allOrders, allProducts, allCustomers, openCash] = await Promise.all([
      SalesDB.getAll(),
      OrdersDB.getAllFiltered({ since: startOfDayISO }),
      ProductsDB.getAll(),
      CustomersDB.getAll(),
      CashRegistersDB.getOpen(),
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

    const dateLabel = now.toLocaleDateString("es-PE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    const report: DailyReport & { tenantId: string } = {
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
    };

    return NextResponse.json(report);
  } catch (err) {
    console.error("[daily-report]", err);
    return NextResponse.json({ error: "Error al generar reporte" }, { status: 500 });
  }
}
