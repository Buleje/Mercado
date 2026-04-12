import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { MarketplaceOrdersDB } from "@/lib/db/marketplace.db";
import { enqueueNotification } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * GET /api/cron/marketplace-daily-summary
 *
 * Envía un resumen diario de ventas del marketplace por WhatsApp
 * a cada tienda que tenga pedidos del día.
 *
 * Sugerencia vercel.json: "0 21 * * *" (21:00 cada día)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("marketplace-daily-summary", async () => {
      // Get all published stores with their tenant info
      const stores = await prisma.store.findMany({
        where: { isPublished: true },
        select: {
          id: true,
          tenantId: true,
          name: true,
          slug: true,
        },
      });

      const summaries: Array<{
        storeName: string;
        orderCount: number;
        totalRevenue: number;
        sent: boolean;
      }> = [];

      for (const store of stores) {
        const todayOrders = await MarketplaceOrdersDB.getTodayOrders(store.tenantId);

        if (todayOrders.length === 0) {
          summaries.push({ storeName: store.name, orderCount: 0, totalRevenue: 0, sent: false });
          continue;
        }

        const activeOrders = todayOrders.filter(
          (o) => o.status !== "cancelado"
        );

        const totalRevenue = activeOrders.reduce((sum, o) => sum + toNumOrZero(o.total), 0);

        // Top 3 products by quantity
        const productMap = new Map<string, { name: string; qty: number; rev: number }>();
        for (const order of activeOrders) {
          for (const item of order.items) {
            const existing = productMap.get(item.name) ?? { name: item.name, qty: 0, rev: 0 };
            productMap.set(item.name, {
              name: item.name,
              qty: existing.qty + item.quantity,
              rev: existing.rev + toNumOrZero(item.price) * item.quantity,
            });
          }
        }
        const top3 = Array.from(productMap.values())
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 3);

        const fechaTexto = new Date().toLocaleDateString("es-PE", {
          weekday: "long",
          day: "numeric",
          month: "long",
        });

        const text = [
          `🏪 *${store.name} — Resumen Marketplace*`,
          `━━━━━━━━━━━━━━━━━━━`,
          `📅 ${fechaTexto}`,
          ``,
          `📦 Pedidos del día: ${activeOrders.length}`,
          `💰 Ventas totales: S/${totalRevenue.toFixed(2)}`,
          `🧾 Ticket promedio: S/${(activeOrders.length > 0 ? totalRevenue / activeOrders.length : 0).toFixed(2)}`,
          ``,
          top3.length > 0 ? `🏆 *Más vendidos:*` : null,
          ...top3.map((p, i) => `  ${i + 1}. ${p.name} (${p.qty} uds — S/${p.rev.toFixed(2)})`),
          ``,
          `─────`,
          `_Resumen automático del marketplace_ 🤖`,
        ].filter((line): line is string => line !== null).join("\n");

        // Get business phone from Settings
        const settings = await prisma.settings.findFirst({
          where: { tenantId: store.tenantId },
          select: { businessPhone: true },
        });

        let sent = false;
        if (settings?.businessPhone) {
          try {
            await enqueueNotification({
              type: "whatsapp",
              recipient: settings.businessPhone,
              message: text,
              tenantId: store.tenantId,
            }).catch(() => {});
            sent = true;
          } catch (err) {
            logger.warn("[cron/marketplace-daily-summary] WhatsApp enqueue failed", {
              store: store.name,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        summaries.push({
          storeName: store.name,
          orderCount: activeOrders.length,
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          sent,
        });
      }

      logger.info("[cron/marketplace-daily-summary] Completed", {
        storesProcessed: stores.length,
        summaries: summaries.filter((s) => s.orderCount > 0).length,
      });

      logActivity(
        "marketplace-daily-summary",
        "Report",
        `Resumen marketplace enviado: ${summaries.filter((s) => s.sent).length} tiendas notificadas`,
        undefined,
        "cron"
      ).catch(() => {});

      return { ok: true, summaries };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/marketplace-daily-summary] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
