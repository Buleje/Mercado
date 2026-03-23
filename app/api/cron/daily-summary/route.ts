export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { SalesDB, CashRegistersDB } from "@/lib/db/sales.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { ProductsDB } from "@/lib/db/products.db";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/daily-summary
 *
 * Recopila el resumen diario: ventas, pedidos, stock bajo,
 * top 5 productos y diferencia de caja.
 * El resultado puede consumirse por otro servicio (WhatsApp / email).
 *
 * Sugerencia vercel.json: "0 20 * * *" (20:00 cada día)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("daily-summary", async () => {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfDayISO = startOfDay.toISOString();

      // Recopilar datos en paralelo
      const [allSales, todayOrders, allProducts, openCash] = await Promise.all([
        SalesDB.getAll(),
        OrdersDB.getAllFiltered({ since: startOfDayISO }),
        ProductsDB.getAll(),
        CashRegistersDB.getOpen(),
      ]);

      // Ventas POS del día
      const todaySales = allSales.filter(
        (s) => new Date(s.createdAt) >= startOfDay
      );

      // Pedidos activos del día (no cancelados)
      const activeOrders = todayOrders.filter((o) => {
        const status = (o.status ?? "").toLowerCase();
        return status !== "cancelado" && status !== "cancelled";
      });

      // Totales
      const salesTotal = todaySales.reduce((sum, s) => sum + (s.total ?? 0), 0);
      const ordersTotal = activeOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);
      const totalVentas = salesTotal + ordersTotal;
      const totalPedidos = todaySales.length + activeOrders.length;

      // Top 5 productos vendidos (por cantidad)
      const productMap: Record<string, { nombre: string; cantidad: number; ingresos: number }> = {};
      for (const sale of todaySales) {
        for (const item of sale.items ?? []) {
          const key = String(item.productId);
          if (!productMap[key]) productMap[key] = { nombre: item.name, cantidad: 0, ingresos: 0 };
          productMap[key].cantidad += item.quantity ?? 0;
          productMap[key].ingresos += (item.price ?? 0) * (item.quantity ?? 0);
        }
      }
      for (const order of activeOrders) {
        for (const item of order.items ?? []) {
          const key = String(item.id);
          if (!productMap[key]) productMap[key] = { nombre: item.name, cantidad: 0, ingresos: 0 };
          productMap[key].cantidad += item.quantity ?? 0;
          productMap[key].ingresos += (item.price ?? 0) * (item.quantity ?? 0);
        }
      }
      const top5Productos = Object.values(productMap)
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);

      // Productos con stock bajo
      const productosStockBajo = allProducts.filter((p) => {
        if (!p.active) return false;
        if (p.stock == null) return false;
        const min = p.stockMin ?? 5;
        return p.stock <= min;
      });

      // Diferencia de caja
      let diferenciaCaja: number | null = null;
      if (openCash) {
        const totalIngresos = openCash.movements
          .filter((m) => m.type === "venta" || m.type === "ingreso")
          .reduce((sum, m) => sum + m.amount, 0);
        const totalEgresos = openCash.movements
          .filter((m) => m.type === "egreso")
          .reduce((sum, m) => sum + m.amount, 0);
        const esperado = openCash.openingAmount + totalIngresos - totalEgresos;
        diferenciaCaja = openCash.closingAmount != null
          ? openCash.closingAmount - esperado
          : null;
      }

      const summary = {
        ok: true,
        fecha: now.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }),
        generadoA: now.toISOString(),
        totalVentas,
        totalPedidos,
        stockBajo: {
          cantidad: productosStockBajo.length,
          productos: productosStockBajo.slice(0, 10).map((p) => ({
            nombre: p.name,
            stock: p.stock,
            minimo: p.stockMin ?? 5,
          })),
        },
        top5Productos,
        caja: {
          abierta: openCash !== null,
          diferencia: diferenciaCaja,
        },
      };

      logger.info("[cron/daily-summary] Resumen diario generado", {
        totalVentas,
        totalPedidos,
        stockBajoCount: productosStockBajo.length,
      });

      logActivity(
        "daily-summary",
        "Report",
        `Resumen diario generado: S/ ${totalVentas.toFixed(2)} en ventas, ${totalPedidos} pedidos`,
        undefined,
        "cron"
      ).catch(() => {});

      return summary;
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/daily-summary] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
