import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queue";
import { sendPushToPhone } from "@/lib/push-sender";
import { NotificationLogsDB } from "@/lib/db/notifications.db";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/dead-stock-report
 *
 * Reporte semanal de productos que NO se han vendido en los últimos 7 días
 * pero siguen activos y con stock > 0. Ayuda al dueño a identificar
 * mercadería "dormida" para hacer ofertas o dejar de comprar.
 *
 * Sugerencia vercel.json: "0 9 * * 1" (lunes 9:00 AM)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("dead-stock-report", async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get all active products with stock
      const activeProducts = await prisma.product.findMany({
        where: {
          tenantId: "main",
          active: true,
          deletedAt: null,
          stock: { gt: 0 },
        },
        select: {
          id: true,
          name: true,
          category: true,
          price: true,
          costPrice: true,
          stock: true,
          unit: true,
        },
      });

      if (activeProducts.length === 0) {
        return { ok: true, deadStock: [], total: 0 };
      }

      // Get product IDs that had sales in the last 7 days
      const recentSaleItems = await prisma.saleItem.findMany({
        where: {
          sale: {
            tenantId: "main",
            createdAt: { gte: sevenDaysAgo },
          },
        },
        select: { productId: true },
        distinct: ["productId"],
      });

      // Also check order items (online orders)
      const recentOrderItems = await prisma.orderItem.findMany({
        where: {
          order: {
            tenantId: "main",
            createdAt: { gte: sevenDaysAgo },
            status: { notIn: ["cancelado"] },
          },
        },
        select: { productId: true },
        distinct: ["productId"],
      });

      const soldProductIds = new Set([
        ...recentSaleItems.map((s) => s.productId),
        ...recentOrderItems.map((o) => o.productId),
      ]);

      // Products with stock but zero sales in 7 days
      const deadStock = activeProducts
        .filter((p) => !soldProductIds.has(p.id))
        .map((p) => ({
          id: p.id,
          nombre: p.name,
          categoria: p.category,
          precio: Number(p.price ?? 0),
          costoUnitario: Number(p.costPrice ?? 0),
          stock: p.stock ?? 0,
          unidad: p.unit ?? "und",
          capitalAtado: ((Number(p.costPrice ?? 0) || Number(p.price ?? 0) * 0.7) * (p.stock ?? 0)),
        }))
        .sort((a, b) => b.capitalAtado - a.capitalAtado);

      if (deadStock.length === 0) {
        return { ok: true, deadStock: [], total: 0, message: "Todos los productos tuvieron ventas esta semana 🎉" };
      }

      const totalCapitalAtado = deadStock.reduce((s, p) => s + p.capitalAtado, 0);

      // Record notification
      await NotificationLogsDB.add({
        type: "dead_stock_weekly",
        recipient: "admin",
        message: `${deadStock.length} productos sin ventas en 7 días. Capital atado: S/ ${totalCapitalAtado.toFixed(2)}`,
        status: "pending",
      });

      // Build WhatsApp message
      const whatsappMsg = [
        `📦 *Reporte Semanal — Productos sin Movimiento*`,
        `🏪 *Buleje*`,
        `━━━━━━━━━━━━━━━━━━━`,
        ``,
        `${deadStock.length} producto(s) no se vendieron en los últimos 7 días:`,
        ``,
        ...deadStock.slice(0, 8).map((p, i) =>
          `  ${i + 1}. *${p.nombre}* — ${p.stock} ${p.unidad} (S/ ${p.capitalAtado.toFixed(2)} en stock)`
        ),
        deadStock.length > 8 ? `  ...y ${deadStock.length - 8} más` : "",
        ``,
        `💰 *Capital atado: S/ ${totalCapitalAtado.toFixed(2)}*`,
        ``,
        `💡 *Sugerencia:* Hacer oferta relámpago en estos productos o reducir la próxima compra.`,
        ``,
        `─────`,
        `Buleje 🏪`,
      ].filter(Boolean).join("\n");

      // Send to owner (fire-and-forget)
      (async () => {
        try {
          const settings = await prisma.settings.findFirst({
            where: { tenantId: "main" },
            select: { businessPhone: true },
          });
          const ownerPhone = settings?.businessPhone || process.env.NOTIFY_PHONE;
          if (ownerPhone) {
            enqueueNotification({
              type: "whatsapp",
              recipient: ownerPhone,
              message: whatsappMsg,
              tenantId: "main",
            }).catch(() => {});
            sendPushToPhone(ownerPhone, {
              title: `📦 ${deadStock.length} productos sin ventas esta semana`,
              body: `Capital atado: S/ ${totalCapitalAtado.toFixed(2)} — revisa cuáles poner en oferta`,
              url: "/admin?module=inventario&tab=stock",
            }).catch(() => {});
          }
        } catch { /* silencioso */ }
      })();

      logger.info("[cron/dead-stock-report] Reporte generado", {
        total: deadStock.length,
        capitalAtado: totalCapitalAtado.toFixed(2),
      });

      logActivity(
        "dead-stock-report",
        "Report",
        `${deadStock.length} productos sin ventas en 7 días. Capital: S/ ${totalCapitalAtado.toFixed(2)}`,
        undefined,
        "cron"
      ).catch(() => {});

      return {
        ok: true,
        total: deadStock.length,
        capitalAtado: totalCapitalAtado,
        deadStock: deadStock.slice(0, 50),
        processedAt: now.toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/dead-stock-report] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
