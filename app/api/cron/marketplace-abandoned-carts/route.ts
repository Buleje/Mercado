import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { MarketplaceAbandonedCartsDB } from "@/lib/db/marketplace.db";
import { enqueueNotification } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/marketplace-abandoned-carts
 *
 * Check for marketplace abandoned carts (>2 hours old, no order placed)
 * and send WhatsApp recovery message.
 *
 * Sugerencia vercel.json: "0 *\/3 * * *" (every 3 hours)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("marketplace-abandoned-carts", async () => {
      const abandonedCarts = await MarketplaceAbandonedCartsDB.getAbandoned(2);

      let sent = 0;
      let failed = 0;

      for (const cart of abandonedCarts) {
        // Check if the customer placed an order in the meantime
        const recentOrder = await prisma.order.findFirst({
          where: {
            source: "marketplace",
            customerPhone: cart.customerPhone,
            createdAt: { gte: cart.createdAt },
          },
          select: { id: true },
        });

        if (recentOrder) {
          // Customer already ordered — mark as converted
          await MarketplaceAbandonedCartsDB.markConverted(cart.storeSlug, cart.customerPhone);
          continue;
        }

        // Get store name
        const store = await prisma.store.findUnique({
          where: { slug: cart.storeSlug },
          select: { name: true, tenantId: true },
        });

        const storeName = store?.name ?? cart.storeSlug;
        let items: Array<{ name: string; quantity: number; price: number }> = [];
        try {
          items = JSON.parse(cart.itemsJson);
        } catch { /* invalid JSON, skip items list */ }

        const itemsText = items.length > 0
          ? items.slice(0, 3).map((i) => `  • ${i.quantity}x ${i.name}`).join("\n")
          : "";

        const message = [
          `🛒 *¡Hola ${cart.customerName}!*`,
          ``,
          `Notamos que dejaste productos en tu carrito de *${storeName}*:`,
          itemsText,
          items.length > 3 ? `  ...y ${items.length - 3} más` : null,
          ``,
          `💰 Total: S/${cart.total.toFixed(2)}`,
          ``,
          `¿Te gustaría completar tu compra? Tu carrito te espera 😊`,
          ``,
          `👉 Visita la tienda para completar tu pedido`,
          ``,
          `_Si ya no lo necesitas, ignora este mensaje._`,
        ].filter((line): line is string => line !== null).join("\n");

        try {
          await enqueueNotification({
            type: "whatsapp",
            recipient: cart.customerPhone,
            message,
            tenantId: store?.tenantId ?? cart.storeSlug,
          }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
          await MarketplaceAbandonedCartsDB.markReminderSent(cart.id);
          sent++;
        } catch (err) {
          logger.warn("[cron/marketplace-abandoned-carts] WhatsApp enqueue failed", {
            cartId: cart.id,
            error: err instanceof Error ? err.message : String(err),
          });
          failed++;
        }
      }

      logger.info("[cron/marketplace-abandoned-carts] Completed", {
        total: abandonedCarts.length,
        sent,
        failed,
      });

      logActivity(
        "marketplace-abandoned-carts",
        "Notification",
        `Carritos abandonados: ${sent} recordatorios enviados, ${failed} fallidos de ${abandonedCarts.length} pendientes`,
        undefined,
        "cron"
      ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

      return { ok: true, total: abandonedCarts.length, sent, failed };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/marketplace-abandoned-carts] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
