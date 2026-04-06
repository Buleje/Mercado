export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { SalesDB, CashRegistersDB } from "@/lib/db/sales.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { ProductsDB } from "@/lib/db/products.db";
import { logger } from "@/lib/logger";
import { enqueueActivityLog } from "@/lib/queue";
import { sendPushToPhone } from "@/lib/push-sender";
import { enqueueNotification } from "@/lib/queue";
import { prisma } from "@/lib/prisma";

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
      // Multi-tenant: process all active tenants
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, slug: true, name: true },
      });

      const summaries: Array<{ tenant: string; totalVentas: number; totalPedidos: number }> = [];

      for (const tenant of tenants) {
        const tenantIds = tenant.id === tenant.slug ? [tenant.id] : [tenant.id, tenant.slug];
        const tenantId = tenant.id;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfDayISO = startOfDay.toISOString();

        // Recopilar datos en paralelo
        const [allSales, todayOrders, allProducts, openCash] = await Promise.all([
          SalesDB.getAll(tenantId),
          OrdersDB.getAllFiltered({ since: startOfDayISO }),
          ProductsDB.getAll(tenantId),
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

        // Top 5 productos vendidos
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

        const ticketPromedio = totalPedidos > 0 ? totalVentas / totalPedidos : 0;
        const fechaTexto = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

        // Auto-save DailySummary record
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        await prisma.dailySummary.upsert({
          where: { tenantId_fecha: { tenantId, fecha: today } },
          update: {
            totalVentas,
            cantidadVentas: totalPedidos,
            ticketPromedio,
            diferenciaCaja,
            stockAlertas: productosStockBajo.length,
            productoTop: top5Productos[0]?.nombre ?? null,
            mejorHora: null,
          },
          create: {
            tenantId,
            fecha: today,
            totalVentas,
            cantidadVentas: totalPedidos,
            ticketPromedio,
            diferenciaCaja,
            stockAlertas: productosStockBajo.length,
            productoTop: top5Productos[0]?.nombre ?? null,
            creadoPor: "cron",
          },
        }).catch(e => logger.warn("[daily-summary] Error saving DailySummary", { error: String(e) }));

        const whatsappText = [
          `📊 *Resumen del día — ${tenant.name}*`,
          `📅 ${fechaTexto}`,
          ``,
          `💰 Ventas: S/ ${totalVentas.toFixed(2)} (${totalPedidos} transacciones)`,
          `🧾 Ticket promedio: S/ ${ticketPromedio.toFixed(2)}`,
          `📦 Stock bajo: ${productosStockBajo.length} productos`,
          diferenciaCaja !== null ? `💵 Diferencia caja: S/ ${diferenciaCaja.toFixed(2)}` : null,
          ``,
          top5Productos.length > 0 ? `🏆 *Top productos:*` : null,
          ...top5Productos.slice(0, 3).map((p, i) => `  ${i + 1}. ${p.nombre} (${p.cantidad} uds)`),
          ``,
          productosStockBajo.length > 0 ? `⚠ *Alertas stock:*` : null,
          ...productosStockBajo.slice(0, 3).map(p => `  - ${p.name}: ${p.stock} uds (mín: ${p.stockMin ?? 5})`),
          ``,
          `─────`,
          `${tenant.name} 🏪`,
        ].filter((line): line is string => line !== null).join("\n");

        // Send WhatsApp + Push to store owner
        (async () => {
          try {
            const settings = await prisma.settings.findFirst({
              where: { tenantId: { in: tenantIds } },
              select: { ownerPhone: true },
            });
            const ownerPhone = settings?.ownerPhone || (tenant.slug === "main" ? process.env.NOTIFY_PHONE : null);
            if (ownerPhone) {
              enqueueNotification({ type: "whatsapp", recipient: ownerPhone, message: whatsappText, tenantId: tenant.id, metadata: { purpose: "daily-summary" } }).catch(() => {});
              sendPushToPhone(ownerPhone, {
                title: `📊 Resumen del día — ${tenant.name}`,
                body: `S/ ${totalVentas.toFixed(2)} en ventas · ${totalPedidos} pedidos · ${productosStockBajo.length} alertas`,
                url: "/admin?module=panel-principal",
              }).catch(() => {});
            }
          } catch { /* silencioso */ }
        })();

        summaries.push({ tenant: tenant.name, totalVentas, totalPedidos });

        enqueueActivityLog({ action: "daily-summary", resource: "Report", userId: "cron", tenantId: tenant.id, details: { description: `[${tenant.name}] Resumen: S/ ${totalVentas.toFixed(2)} en ventas, ${totalPedidos} pedidos` }, timestamp: new Date().toISOString() }).catch(() => {});
      }

      logger.info("[cron/daily-summary] Completado", { tenants: summaries.length });

      return {
        ok: true,
        tenants: summaries,
        generadoA: new Date().toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/daily-summary] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
