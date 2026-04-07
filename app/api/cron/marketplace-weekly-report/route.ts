export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queue";
import { sendPushToPhone } from "@/lib/push-sender";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/marketplace-weekly-report
 * Lunes 8AM — Envía reporte semanal de rendimiento a cada tienda activa
 * y un resumen agregado al admin de la plataforma.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("marketplace-weekly-report", async () => {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 7);

      // Get all active stores with their tenant settings for phone
      const stores = await prisma.store.findMany({
        where: { isPublished: true },
        select: {
          id: true,
          tenantId: true,
          name: true,
          slug: true,
          commission: true,
        },
      });

      if (stores.length === 0) {
        return { sent: 0, message: "No active stores" };
      }

      // Get phone numbers for each tenant (ownerPhone vive en Tenant, no en Settings)
      const tenantIds = stores.map((s) => s.tenantId);
      const tenants = await prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, ownerPhone: true },
      });
      const phoneMap = new Map(tenants.map((t) => [t.id, t.ownerPhone]));

      // Get orders for all stores in the past week
      const weekOrders = await prisma.order.findMany({
        where: {
          source: "marketplace",
          deletedAt: null,
          createdAt: { gte: weekStart },
          tenantId: { in: tenantIds },
        },
        select: {
          tenantId: true,
          total: true,
          status: true,
          items: { select: { quantity: true, name: true, price: true } },
        },
      });

      // Group orders by tenant
      const ordersByTenant = new Map<string, typeof weekOrders>();
      for (const order of weekOrders) {
        const list = ordersByTenant.get(order.tenantId) ?? [];
        list.push(order);
        ordersByTenant.set(order.tenantId, list);
      }

      let sentCount = 0;
      let totalMarketplaceRevenue = 0;
      let totalMarketplaceOrders = 0;
      const storeReports: { name: string; orders: number; revenue: number }[] = [];

      for (const store of stores) {
        const orders = ordersByTenant.get(store.tenantId) ?? [];
        const revenue = orders.reduce((sum, o) => sum + o.total, 0);
        const completedOrders = orders.filter((o) => o.status === "entregado").length;
        const cancelledOrders = orders.filter((o) => o.status === "cancelado").length;
        const avgTicket = orders.length > 0 ? revenue / orders.length : 0;

        totalMarketplaceRevenue += revenue;
        totalMarketplaceOrders += orders.length;
        storeReports.push({ name: store.name, orders: orders.length, revenue });

        // Find top 3 products by quantity
        const productSales = new Map<string, number>();
        for (const order of orders) {
          for (const item of order.items) {
            productSales.set(item.name, (productSales.get(item.name) ?? 0) + item.quantity);
          }
        }
        const topProducts = [...productSales.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);

        const phone = phoneMap.get(store.tenantId) ?? process.env.NOTIFY_PHONE;
        if (!phone) continue;

        const commissionAmount = revenue * (store.commission / 100);

        // Build WhatsApp message
        const topStr = topProducts.length > 0
          ? topProducts.map(([name, qty], i) => `  ${i + 1}. ${name} (${qty} uds)`).join("\n")
          : "  Sin ventas esta semana";

        const msg = [
          `📊 *Reporte Semanal — ${store.name}*`,
          `Semana: ${weekStart.toLocaleDateString("es-PE", { day: "numeric", month: "short" })} - ${now.toLocaleDateString("es-PE", { day: "numeric", month: "short" })}`,
          ``,
          `🛒 Pedidos: ${orders.length}`,
          `✅ Completados: ${completedOrders}`,
          `❌ Cancelados: ${cancelledOrders}`,
          `💰 Ventas totales: S/${revenue.toFixed(2)}`,
          `🎫 Ticket promedio: S/${avgTicket.toFixed(2)}`,
          `📋 Comisión: S/${commissionAmount.toFixed(2)} (${store.commission}%)`,
          ``,
          `🏆 *Top productos:*`,
          topStr,
          ``,
          `¡Sigue así! 💪`,
        ].join("\n");

        enqueueNotification({
          type: "whatsapp",
          recipient: phone,
          message: msg,
          tenantId: store.tenantId,
        }).catch(() => {});
        sendPushToPhone(phone, {
          title: `📊 Reporte semanal — ${store.name}`,
          body: `${orders.length} pedidos · S/${revenue.toFixed(2)} en ventas esta semana`,
          url: "/admin#marketplace",
        }).catch(() => {});

        sentCount++;
      }

      // Send aggregated report to platform admin
      const adminPhone = process.env.NOTIFY_PHONE;
      if (adminPhone && storeReports.length > 0) {
        storeReports.sort((a, b) => b.revenue - a.revenue);

        const ranking = storeReports
          .slice(0, 5)
          .map((s, i) => `  ${i + 1}. ${s.name}: ${s.orders} pedidos · S/${s.revenue.toFixed(2)}`)
          .join("\n");

        const zeroSalesStores = storeReports.filter((s) => s.orders === 0);

        const adminMsg = [
          `📊 *Reporte Semanal del Marketplace*`,
          `Semana: ${weekStart.toLocaleDateString("es-PE", { day: "numeric", month: "short" })} - ${now.toLocaleDateString("es-PE", { day: "numeric", month: "short" })}`,
          ``,
          `🏪 Tiendas activas: ${stores.length}`,
          `🛒 Total pedidos: ${totalMarketplaceOrders}`,
          `💰 Ventas totales: S/${totalMarketplaceRevenue.toFixed(2)}`,
          ``,
          `🏆 *Top 5 tiendas:*`,
          ranking,
          ...(zeroSalesStores.length > 0
            ? [``, `⚠️ *${zeroSalesStores.length} tienda(s) sin ventas:*`, zeroSalesStores.map((s) => `  • ${s.name}`).join("\n")]
            : []),
          ``,
          `Reportes enviados a ${sentCount} tienda(s).`,
        ].join("\n");

        enqueueNotification({
          type: "whatsapp",
          recipient: adminPhone,
          message: adminMsg,
          tenantId: "main",
        }).catch(() => {});
        sendPushToPhone(adminPhone, {
          title: "📊 Reporte semanal marketplace",
          body: `${stores.length} tiendas · ${totalMarketplaceOrders} pedidos · S/${totalMarketplaceRevenue.toFixed(2)}`,
          url: "/admin#marketplace",
        }).catch(() => {});
      }

      return { sent: sentCount, stores: stores.length, orders: totalMarketplaceOrders, revenue: totalMarketplaceRevenue };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("marketplace-weekly-report cron failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
