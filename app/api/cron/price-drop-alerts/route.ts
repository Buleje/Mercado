export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { prisma } from "@/lib/prisma";
import { sendPushToPhone } from "@/lib/push-sender";
import { enqueueNotification } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/price-drop-alerts
 *
 * Revisa el historial de precios del último día. Si un producto bajó de precio
 * y alguien lo tiene en su lista de compras (ShoppingList), le envía una
 * notificación push + WhatsApp para que aproveche la oferta.
 *
 * vercel.json: "0 11 * * *" (11:00 AM diario)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("price-drop-alerts", async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Multi-tenant: process all active tenants
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, slug: true, name: true },
      });

      const allResults: Array<{ tenant: string; priceDrops: number; notifications: number }> = [];

      for (const tenant of tenants) {
        const tenantIds = tenant.id === tenant.slug ? [tenant.id] : [tenant.id, tenant.slug];

        // 1. Find products with price drops in the last 24h for this tenant
        const priceDrops = await prisma.priceHistory.findMany({
          where: {
            changedAt: { gte: oneDayAgo },
            product: { tenantId: { in: tenantIds } },
          },
          select: {
            productId: true,
            oldPrice: true,
            newPrice: true,
          },
          orderBy: { changedAt: "desc" },
        });

        // Filter to actual price drops and dedupe by product (take latest)
        const dropsByProduct = new Map<number, { oldPrice: number; newPrice: number }>();
        for (const drop of priceDrops) {
          const oldP = Number(drop.oldPrice ?? 0);
          const newP = Number(drop.newPrice ?? 0);
          if (newP >= oldP || newP <= 0) continue;
          if (dropsByProduct.has(drop.productId)) continue; // already have latest
          dropsByProduct.set(drop.productId, { oldPrice: oldP, newPrice: newP });
        }

        if (dropsByProduct.size === 0) continue;

        const droppedProductIds = Array.from(dropsByProduct.keys());

        // 2. Find ShoppingListItems referencing these products for this tenant
        const listItems = await prisma.shoppingListItem.findMany({
          where: {
            productId: { in: droppedProductIds },
            shoppingList: { tenantId: { in: tenantIds } },
          },
          select: {
            productId: true,
            shoppingList: {
              select: {
                customerPhone: true,
                name: true,
              },
            },
          },
        });

        if (listItems.length === 0) {
          allResults.push({ tenant: tenant.name, priceDrops: dropsByProduct.size, notifications: 0 });
          continue;
        }

        // 3. Get product names for the message
        const products = await prisma.product.findMany({
          where: { id: { in: droppedProductIds }, tenantId: { in: tenantIds } },
          select: { id: true, name: true },
        });
        const productNames = new Map(products.map((p) => [p.id, p.name]));

        // 4. Group notifications by customer phone (avoid duplicates)
        const customerNotifications = new Map<
          string,
          { products: { name: string; oldPrice: number; newPrice: number; pct: number }[] }
        >();

        for (const item of listItems) {
          const phone = item.shoppingList?.customerPhone;
          if (!phone) continue;

          const drop = dropsByProduct.get(item.productId);
          if (!drop) continue;

          const name = productNames.get(item.productId) ?? "Producto";
          const pctDrop = Math.round(((drop.oldPrice - drop.newPrice) / drop.oldPrice) * 100);

          if (!customerNotifications.has(phone)) {
            customerNotifications.set(phone, { products: [] });
          }
          customerNotifications.get(phone)!.products.push({
            name,
            oldPrice: drop.oldPrice,
            newPrice: drop.newPrice,
            pct: pctDrop,
          });
        }

        // 5. Send notifications (fire-and-forget, max 50 per tenant per run)
        let sent = 0;
        for (const [phone, data] of customerNotifications) {
          if (sent >= 50) break;

          const topProduct = data.products.sort((a, b) => b.pct - a.pct)[0];

          // Push notification
          sendPushToPhone(phone, {
            title: `🏷️ ¡Bajó de precio! ${topProduct.name}`,
            body: `Ahora a S/ ${topProduct.newPrice.toFixed(2)} (antes S/ ${topProduct.oldPrice.toFixed(2)}) — ${topProduct.pct}% menos. ${data.products.length > 1 ? `Y ${data.products.length - 1} producto(s) más.` : ""}`,
            url: "/tienda",
          }).catch(() => {});

          // WhatsApp if multiple drops or significant discount
          if (topProduct.pct >= 10 || data.products.length > 1) {
            const productLines = data.products
              .slice(0, 5)
              .map(
                (p) =>
                  `  🏷️ *${p.name}*: ~S/ ${p.oldPrice.toFixed(2)}~ → *S/ ${p.newPrice.toFixed(2)}* (-${p.pct}%)`
              )
              .join("\n");

            const msg = [
              `🔔 *¡Productos de tu lista bajaron de precio!*`,
              ``,
              productLines,
              data.products.length > 5 ? `  ...y ${data.products.length - 5} más` : "",
              ``,
              `👉 Aprovecha antes de que suba: ${process.env.NEXT_PUBLIC_APP_URL || "https://buleje.com"}/tienda`,
              ``,
              `─────`,
              `${tenant.name} 🏪`,
            ]
              .filter(Boolean)
              .join("\n");

            enqueueNotification({
              type: "whatsapp",
              recipient: phone,
              message: msg,
              tenantId: tenant.id,
            }).catch(() => {});
          }

          sent++;
        }

        logActivity(
          "price-drop-alerts",
          "Notification",
          `[${tenant.name}] ${sent} clientes notificados sobre ${dropsByProduct.size} productos con baja de precio`,
          undefined,
          "cron"
        ).catch(() => {});

        allResults.push({ tenant: tenant.name, priceDrops: dropsByProduct.size, notifications: sent });
      }

      logger.info("[cron/price-drop-alerts] Completado", { tenants: allResults.length });

      return {
        ok: true,
        tenants: allResults,
        processedAt: now.toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/price-drop-alerts] Error fatal", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
