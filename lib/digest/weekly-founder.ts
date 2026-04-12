import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * ROADMAP ITEM #55 — Weekly digest founder
 *
 * Genera un resumen semanal con métricas ejecutivas para Brandon:
 * ingresos, pedidos, clientes nuevos, top productos, alertas.
 * Se llama desde un cron (app/api/cron/weekly-founder-digest/route.ts)
 * y puede mandarse por email/WhatsApp.
 */

export interface FounderWeeklyDigest {
  weekStart: string;
  weekEnd: string;
  revenue: number;
  orders: number;
  newCustomers: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  churnedCustomers: number;
  lowStockAlerts: number;
  avgOrderValue: number;
  notesMd: string;
}

export async function buildFounderDigest(tenantId: string): Promise<FounderWeeklyDigest> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  try {
    const [orders, newCustomers, products, churned] = await Promise.all([
      prisma.order.findMany({
        where: { tenantId, createdAt: { gte: weekAgo } },
        include: { items: true },
      }),
      prisma.customer.count({
        where: { tenantId, createdAt: { gte: weekAgo } },
      }),
      prisma.product.findMany({
        where: { tenantId, active: true },
        select: { id: true, name: true, stock: true },
      }),
      prisma.customer.count({
        where: {
          tenantId,
          createdAt: { lt: twoWeeksAgo },
          orders: { none: { createdAt: { gte: twoWeeksAgo } } },
        },
      }),
    ]);

    const revenue = orders.reduce((acc, o) => acc + Number(o.total ?? 0), 0);
    const ordersCount = orders.length;
    const avgOrderValue = ordersCount > 0 ? revenue / ordersCount : 0;

    const productStats = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of orders) {
      for (const item of o.items) {
        const key = String(item.productId ?? item.name ?? "unknown");
        const entry = productStats.get(key) ?? {
          name: item.name ?? "Producto",
          qty: 0,
          revenue: 0,
        };
        entry.qty += item.quantity ?? 0;
        entry.revenue += Number(item.price ?? 0) * (item.quantity ?? 0);
        productStats.set(key, entry);
      }
    }
    const topProducts = [...productStats.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const lowStockAlerts = products.filter((p) => (p.stock ?? 0) <= 5).length;

    const notesMd = [
      `# Resumen semanal — ${weekAgo.toISOString().slice(0, 10)} a ${now.toISOString().slice(0, 10)}`,
      ``,
      `- **Ingresos**: S/${revenue.toFixed(2)}`,
      `- **Pedidos**: ${ordersCount}`,
      `- **Ticket promedio**: S/${avgOrderValue.toFixed(2)}`,
      `- **Clientes nuevos**: ${newCustomers}`,
      `- **Clientes dormidos (14d+)**: ${churned}`,
      `- **Alertas de stock bajo**: ${lowStockAlerts}`,
      ``,
      `## Top 5 productos`,
      ...topProducts.map(
        (p, i) => `${i + 1}. **${p.name}** — ${p.qty} unidades, S/${p.revenue.toFixed(2)}`,
      ),
    ].join("\n");

    return {
      weekStart: weekAgo.toISOString(),
      weekEnd: now.toISOString(),
      revenue,
      orders: ordersCount,
      newCustomers,
      topProducts,
      churnedCustomers: churned,
      lowStockAlerts,
      avgOrderValue,
      notesMd,
    };
  } catch (err) {
    logger.error("[weekly-founder-digest] failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      weekStart: weekAgo.toISOString(),
      weekEnd: now.toISOString(),
      revenue: 0,
      orders: 0,
      newCustomers: 0,
      topProducts: [],
      churnedCustomers: 0,
      lowStockAlerts: 0,
      avgOrderValue: 0,
      notesMd: "_Digest no disponible — error interno._",
    };
  }
}
