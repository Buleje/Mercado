import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { ProductsDB } from "@/lib/db/products.db";
import { CustomersDB } from "@/lib/db/customers.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { SalesDB } from "@/lib/db/sales.db";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/auto-backup
 *
 * Exporta un snapshot de resumen con conteos de:
 * productos activos, ventas del día, clientes y órdenes activas.
 * El resultado puede almacenarse en un servicio externo (S3, Drive, etc.)
 *
 * Sugerencia vercel.json: "0 23 * * *" (23:00 cada día)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("auto-backup", async () => {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfDayISO = startOfDay.toISOString();

      // Obtener datos en paralelo
      const [allProducts, allCustomers, allSales, todayOrders] = await Promise.all([
        ProductsDB.getAll("main"),
        CustomersDB.getAll("main"),
        SalesDB.getAll("main"),
        OrdersDB.getAllFiltered({ since: startOfDayISO, tenantId: "main" }),
      ]);

      // Productos
      const productosActivos = allProducts.filter((p) => p.active).length;
      const productosTotal = allProducts.length;
      const productosStockBajo = allProducts.filter((p) => {
        if (!p.active || p.stock == null) return false;
        return p.stock <= (p.stockMin ?? 5);
      }).length;

      // Clientes
      const clientesTotal = Array.isArray(allCustomers) ? allCustomers.length : 0;
      const clientesNuevosHoy = Array.isArray(allCustomers)
        ? allCustomers.filter(
            (c) => c.createdAt && new Date(c.createdAt) >= startOfDay
          ).length
        : 0;

      // Ventas del día (POS)
      const ventasHoy = allSales.filter((s) => new Date(s.createdAt) >= startOfDay);
      const totalVentasPOS = ventasHoy.reduce((sum, s) => sum + (s.total ?? 0), 0);

      // Órdenes activas del día
      const ordenesActivas = todayOrders.filter((o) => {
        const status = (o.status ?? "").toLowerCase();
        return status !== "cancelado" && status !== "cancelled" && status !== "entregado";
      });
      const totalOrdenesActivas = ordenesActivas.length;
      const totalOrdenesImporte = ordenesActivas.reduce(
        (sum, o) => sum + (o.total ?? 0),
        0
      );

      const backup = {
        ok: true,
        timestamp: now.toISOString(),
        fecha: now.toLocaleDateString("es-PE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
        productos: {
          total: productosTotal,
          activos: productosActivos,
          inactivos: productosTotal - productosActivos,
          stockBajo: productosStockBajo,
        },
        ventas: {
          transaccionesPOS: ventasHoy.length,
          totalPOS: totalVentasPOS,
          ordenesActivas: totalOrdenesActivas,
          totalOrdenes: totalOrdenesImporte,
          totalGeneral: totalVentasPOS + totalOrdenesImporte,
        },
        clientes: {
          total: clientesTotal,
          nuevosHoy: clientesNuevosHoy,
        },
        ordenes: {
          activas: totalOrdenesActivas,
        },
      };

      logger.info("[cron/auto-backup] Backup diario generado", {
        productosTotal,
        clientesTotal,
        ventasHoy: ventasHoy.length,
        ordenesActivas: totalOrdenesActivas,
      });

      logActivity(
        "auto-backup",
        "System",
        `Backup diario: ${productosActivos} productos, ${clientesTotal} clientes, S/ ${(totalVentasPOS + totalOrdenesImporte).toFixed(2)} en ventas`,
        undefined,
        "cron"
      ).catch(() => {});

      return backup;
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/auto-backup] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
