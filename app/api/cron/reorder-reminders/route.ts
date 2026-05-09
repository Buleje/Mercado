import { NextRequest, NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { withCronRetry } from "@/lib/cron-retry";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/reorder-reminders
 *
 * Analiza el historial de compras de cada cliente y detecta
 * productos que compran con frecuencia. Si ya pasó el tiempo
 * habitual sin que vuelvan a comprar, les envía una push notification.
 *
 * Lógica:
 * 1. Buscar clientes con 2+ pedidos en los últimos 90 días
 * 2. Para cada cliente, agrupar items por producto
 * 3. Si un producto se compró 2+ veces, calcular intervalo promedio
 * 4. Si han pasado más días que el intervalo, enviar recordatorio
 * 5. Máximo 1 recordatorio por cliente por ejecución
 *
 * Sugerencia vercel.json: "0 10 * * *" (10:00 AM diario)
 * Autorización: Bearer <CRON_SECRET>
 */
export const GET = withCronAuth("reorder-reminders", async (req) => {
  try {
    const result = await withCronRetry("reorder-reminders", async () => {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago

      // Multi-tenant: process all active tenants
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, slug: true, name: true },
      });

      const allResults: Array<{ tenant: string; reminders: number; analyzed: number }> = [];

      for (const tenant of tenants) {
        const tenantIds = tenant.id === tenant.slug ? [tenant.id] : [tenant.id, tenant.slug];

        // Fetch delivered orders from last 90 days with items and customer phone for this tenant
        const orders = await prisma.order.findMany({
          where: {
            tenantId: { in: tenantIds },
            status: "entregado",
            createdAt: { gt: cutoff },
            customerPhone: { not: "" },
          },
          select: {
            customerPhone: true,
            customerName: true,
            createdAt: true,
            items: {
              select: {
                productId: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        });

        if (orders.length === 0) continue;

        // Group orders by customer phone
        const customerOrders = new Map<
          string,
          { name: string; orders: { date: Date; products: string[] }[] }
        >();

        for (const order of orders) {
          const phone = order.customerPhone;
          if (!phone) continue;
          if (!customerOrders.has(phone)) {
            customerOrders.set(phone, {
              name: order.customerName ?? "",
              orders: [],
            });
          }
          customerOrders.get(phone)!.orders.push({
            date: order.createdAt,
            products: order.items.map((i) => i.name),
          });
        }

        let remindersSent = 0;
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        for (const [phone, data] of customerOrders) {
          // Need at least 2 orders to detect a pattern
          if (data.orders.length < 2) continue;

          // Find products bought in 2+ separate orders
          const productFreq = new Map<
            string,
            { dates: number[] }
          >();

          for (const order of data.orders) {
            const seen = new Set<string>();
            for (const product of order.products) {
              if (seen.has(product)) continue;
              seen.add(product);
              if (!productFreq.has(product)) {
                productFreq.set(product, { dates: [] });
              }
              productFreq.get(product)!.dates.push(order.date.getTime());
            }
          }

          // Find the best candidate product to remind about
          let bestProduct: string | null = null;
          let highestScore = 0;

          for (const [product, info] of productFreq) {
            if (info.dates.length < 2) continue;

            // Calculate average interval between purchases
            const sortedDates = info.dates.sort((a, b) => a - b);
            let totalInterval = 0;
            for (let i = 1; i < sortedDates.length; i++) {
              totalInterval += sortedDates[i] - sortedDates[i - 1];
            }
            const avgIntervalDays = totalInterval / ((sortedDates.length - 1) * oneDayMs);

            // How many days since last purchase of this product
            const lastPurchase = sortedDates[sortedDates.length - 1];
            const daysSince = (now - lastPurchase) / oneDayMs;

            // Score: higher when overdue (daysSince > avgInterval) and frequently bought
            if (daysSince >= avgIntervalDays * 0.9) {
              const overdueRatio = daysSince / avgIntervalDays;
              const frequencyBonus = info.dates.length;
              const score = overdueRatio * frequencyBonus;

              if (score > highestScore) {
                highestScore = score;
                bestProduct = product;
              }
            }
          }

          if (!bestProduct) continue;

          // Calculate days since last purchase for this product
          const productDates = productFreq.get(bestProduct)!.dates.sort((a, b) => a - b);
          const lastDate = productDates[productDates.length - 1];
          const daysSinceLast = Math.floor((now - lastDate) / oneDayMs);

          // Avoid spamming — don't remind if last purchase was less than 3 days ago
          if (daysSinceLast < 3) continue;

          // Send push + WhatsApp (fire-and-forget)
          const greeting = data.name ? `${data.name}, ¿` : "¿";
          const msgBody = `${greeting}necesitas más ${bestProduct}? Ya pasaron ${daysSinceLast} días desde tu última compra.`;

          import("@/lib/push-sender")
            .then(({ sendPushToPhone }) =>
              sendPushToPhone(phone, {
                title: "🛒 ¿Ya se te acaba?",
                body: msgBody,
                url: "/tienda",
              }),
            )
            .catch((err) => logger.error("[cron/reorder-reminders] push send failed", { error: String(err), phone }));

          // WhatsApp personalizado
          const whatsappMsg = [
            `🛒 *¿Ya se te acaba?*`,
            ``,
            `Hola${data.name ? ` ${data.name}` : ""} 👋`,
            `Hace ${daysSinceLast} días compraste *${bestProduct}* y quizás ya lo necesitas de nuevo.`,
            ``,
            `👉 Pide aquí: ${process.env.NEXT_PUBLIC_APP_URL || "https://buleje.pe"}/tienda`,
            ``,
            `─────`,
            `${tenant.name} 🏪`,
          ].join("\n");
          enqueueNotification({
            type: "whatsapp",
            recipient: phone,
            message: whatsappMsg,
            tenantId: tenant.id,
          }).catch((err) => logger.error("[cron/reorder-reminders] WhatsApp enqueue failed", { error: String(err), phone, tenantId: tenant.id }));

          remindersSent++;

          // Max 50 reminders per tenant per cron run to avoid overwhelming
          if (remindersSent >= 50) break;
        }

        logActivity(
          "reorder-reminders",
          "Notification",
          `[${tenant.name}] ${remindersSent} recordatorios enviados (${customerOrders.size} clientes analizados)`,
          undefined,
          "cron"
        ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

        allResults.push({ tenant: tenant.name, reminders: remindersSent, analyzed: customerOrders.size });
      }

      logger.info("[cron/reorder-reminders] Completado", { tenants: allResults.length });

      return { ok: true, tenants: allResults };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/reorder-reminders] Error:", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
});
