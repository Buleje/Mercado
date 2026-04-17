import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queue";
import { sendPushToPhone } from "@/lib/push-sender";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * GET /api/cron/category-margins-report
 *
 * Reporte semanal de márgenes de ganancia por categoría.
 * Agrupa las ventas de los últimos 7 días, calcula el margen promedio
 * por categoría y envía resumen al dueño por WhatsApp.
 *
 * Ayuda al dueño a saber cuáles categorías le dejan más ganancia
 * y cuáles "venden mucho pero ganan poco".
 *
 * vercel.json: "0 8 * * 1" (lunes 8:00 AM)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("category-margins-report", async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Iterate over all active tenants (multi-tenant)
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, name: true },
      });

      const allResults: { tenantId: string; categoriesCount: number; totalProfit: number }[] = [];

      for (const tenant of tenants) {
        const tenantId = tenant.id;

      // Get all sale items from the last 7 days with product category
      const saleItems = await prisma.saleItem.findMany({
        where: {
          sale: {
            tenantId,
            createdAt: { gte: sevenDaysAgo },
          },
          costPrice: { not: null },
        },
        select: {
          price: true,
          costPrice: true,
          quantity: true,
          product: {
            select: {
              category: true,
            },
          },
        },
      });

      if (saleItems.length === 0) {
        continue;
      }

      // Group by category and calculate margins
      const categoryMap = new Map<
        string,
        { revenue: number; cost: number; units: number; items: number }
      >();

      for (const item of saleItems) {
        const cat = item.product?.category || "Sin categoría";
        const existing = categoryMap.get(cat) || { revenue: 0, cost: 0, units: 0, items: 0 };

        const itemRevenue = toNumOrZero(item.price) * item.quantity;
        const itemCost = toNumOrZero(item.costPrice) * item.quantity;

        existing.revenue += itemRevenue;
        existing.cost += itemCost;
        existing.units += item.quantity;
        existing.items += 1;
        categoryMap.set(cat, existing);
      }

      // Convert to sorted array
      const categories = Array.from(categoryMap.entries())
        .map(([name, data]) => {
          const profit = data.revenue - data.cost;
          const marginPct = data.revenue > 0 ? (profit / data.revenue) * 100 : 0;
          return {
            name,
            revenue: Math.round(data.revenue * 100) / 100,
            cost: Math.round(data.cost * 100) / 100,
            profit: Math.round(profit * 100) / 100,
            marginPct: Math.round(marginPct * 10) / 10,
            units: data.units,
          };
        })
        .sort((a, b) => b.profit - a.profit);

      // Totals
      const totalRevenue = categories.reduce((s, c) => s + c.revenue, 0);
      const totalCost = categories.reduce((s, c) => s + c.cost, 0);
      const totalProfit = totalRevenue - totalCost;
      const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      // Best and worst
      const best = categories[0];
      const worst = categories.length > 1 ? categories[categories.length - 1] : null;

      // Build WhatsApp message
      const lines: string[] = [
        `📊 *Márgenes por Categoría — Semana*`,
        `🏪 *${tenant.name}*`,
        ``,
        `💰 Venta total: S/ ${totalRevenue.toFixed(2)}`,
        `📈 Ganancia total: S/ ${totalProfit.toFixed(2)} (${overallMargin.toFixed(1)}%)`,
        ``,
      ];

      const top = categories.slice(0, 10);
      for (const cat of top) {
        const emoji = cat.marginPct >= 30 ? "🟢" : cat.marginPct >= 15 ? "🟡" : "🔴";
        lines.push(
          `${emoji} *${cat.name}*: S/ ${cat.profit.toFixed(2)} ganancia (${cat.marginPct}% margen) · ${cat.units} vendidos`
        );
      }

      if (best) {
        lines.push(``);
        lines.push(`🏆 Mejor margen: *${best.name}* con ${best.marginPct}%`);
      }
      if (worst && worst.marginPct < 15) {
        lines.push(`⚠️ Margen bajo: *${worst.name}* con ${worst.marginPct}% — ¿subir precio o buscar mejor proveedor?`);
      }

      const message = lines.join("\n");

      // Send to owner
      const settings = await prisma.settings.findFirst({
        where: { tenantId },
        select: { businessPhone: true },
      });
      const phone = settings?.businessPhone || process.env.NOTIFY_PHONE;

      if (phone) {
        enqueueNotification({
          type: "whatsapp",
          recipient: phone,
          message,
          tenantId,
        }).catch((err) => logger.error("[cron/category-margins-report] WhatsApp enqueue failed", { error: String(err), tenantId }));
        sendPushToPhone(phone, {
          title: "📊 Márgenes semanales",
          body: `Ganancia: S/ ${totalProfit.toFixed(2)} (${overallMargin.toFixed(1)}%). Mejor: ${best?.name ?? "—"}`,
          url: "/admin?module=ventas",
        }).catch((err) => logger.error("[cron/category-margins-report] push send failed", { error: String(err), tenantId }));
      }

      logActivity(
        "cron_category_margins_report",
        "report",
        `${categories.length} categorías, ganancia S/ ${totalProfit.toFixed(2)} (${overallMargin.toFixed(1)}%)`,
      ).catch(() => {});

      allResults.push({ tenantId, categoriesCount: categories.length, totalProfit });
      } // end for tenant

      return {
        ok: true,
        tenantsProcessed: tenants.length,
        results: allResults,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error("category-margins-report cron failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
