import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queue";
import { sendPushToPhone } from "@/lib/push-sender";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/daily-deal-bundle
 *
 * Crea un "Paquete del Día" automático con 3-5 productos que NO se vendieron
 * en los últimos 7 días. El paquete tiene 15% de descuento sobre la suma de
 * precios individuales. Al día siguiente se desactiva el paquete anterior
 * y se crea uno nuevo.
 *
 * vercel.json: "0 7 * * *" (7:00 AM diario)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("daily-deal-bundle", async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const DISCOUNT_PCT = 15;
      const MIN_PRODUCTS = 3;
      const MAX_PRODUCTS = 5;

      // Iterate over all active tenants (multi-tenant)
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, name: true },
      });

      const allResults: { tenantId: string; bundleId?: string; bundleName?: string; skipped?: string }[] = [];

      for (const tenant of tenants) {
        const tenantId = tenant.id;

      // 1. Deactivate yesterday's auto-bundle (if any)
      await prisma.bundle.updateMany({
        where: {
          tenantId,
          name: { startsWith: "🔥 Paquete del Día" },
          active: true,
        },
        data: { active: false },
      });

      // 2. Find active products with stock but zero sales in 7 days
      const activeProducts = await prisma.product.findMany({
        where: {
          tenantId,
          active: true,
          deletedAt: null,
          stock: { gt: 0 },
          price: { gt: 0 },
        },
        select: {
          id: true,
          name: true,
          price: true,
          costPrice: true,
          stock: true,
          image: true,
        },
      });

      if (activeProducts.length === 0) {
        allResults.push({ tenantId, skipped: "No hay productos activos" });
        continue;
      }

      // Get products that sold in last 7 days
      const recentSaleItems = await prisma.saleItem.findMany({
        where: {
          sale: { tenantId, createdAt: { gte: sevenDaysAgo } },
        },
        select: { productId: true },
        distinct: ["productId"],
      });

      const recentOrderItems = await prisma.orderItem.findMany({
        where: {
          order: {
            tenantId,
            createdAt: { gte: sevenDaysAgo },
            status: { notIn: ["cancelado"] },
          },
        },
        select: { productId: true },
        distinct: ["productId"],
      });

      const soldIds = new Set([
        ...recentSaleItems.map((s) => s.productId),
        ...recentOrderItems.map((o) => o.productId),
      ]);

      // Dead stock: active + stock > 0 but no sales in 7 days
      const deadStock = activeProducts
        .filter((p) => !soldIds.has(p.id))
        .map((p) => ({
          ...p,
          priceNum: Number(p.price ?? 0),
          costNum: Number(p.costPrice ?? 0),
        }))
        .filter((p) => p.priceNum > 0)
        .sort((a, b) => {
          const capitalA = a.costNum * (a.stock ?? 1);
          const capitalB = b.costNum * (b.stock ?? 1);
          return capitalB - capitalA;
        });

      if (deadStock.length < MIN_PRODUCTS) {
        allResults.push({ tenantId, skipped: `Solo ${deadStock.length} productos sin ventas` });
        continue;
      }

      // Pick top products for the bundle
      const selected = deadStock.slice(0, MAX_PRODUCTS);
      const sumPrices = selected.reduce((s, p) => s + p.priceNum, 0);
      const bundlePrice = Math.round(sumPrices * (1 - DISCOUNT_PCT / 100) * 100) / 100;

      // 3. Create the bundle
      const dateStr = now.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
      const bundleName = `🔥 Paquete del Día — ${dateStr}`;

      const bundle = await prisma.bundle.create({
        data: {
          name: bundleName,
          description: `${selected.length} productos seleccionados con ${DISCOUNT_PCT}% de descuento. ¡Solo por hoy!`,
          price: bundlePrice,
          image: selected[0]?.image ?? null,
          active: true,
          tenantId,
          items: {
            create: selected.map((p) => ({
              productId: p.id,
              quantity: 1,
            })),
          },
        },
        include: { items: true },
      });

      // 4. Notify owner via WhatsApp + Push
      const productList = selected.map((p, i) => `  ${i + 1}. ${p.name} (S/ ${p.priceNum.toFixed(2)})`).join("\n");
      const whatsappMsg = [
        `🔥 *Paquete del Día creado*`,
        `🏪 *${tenant.name}*`,
        `━━━━━━━━━━━━━━━━━━━`,
        ``,
        `${selected.length} productos sin ventas en 7 días se armaron en paquete:`,
        ``,
        productList,
        ``,
        `💰 Precio individual: S/ ${sumPrices.toFixed(2)}`,
        `🏷️ *Precio paquete: S/ ${bundlePrice.toFixed(2)} (-${DISCOUNT_PCT}%)*`,
        ``,
        `Se desactivará mañana automáticamente.`,
        ``,
        `─────`,
        `Buleje 🏪`,
      ].join("\n");

      (async () => {
        try {
          const settings = await prisma.settings.findFirst({
            where: { tenantId },
            select: { businessPhone: true },
          });
          const ownerPhone = settings?.businessPhone || process.env.NOTIFY_PHONE;
          if (ownerPhone) {
            enqueueNotification({
              type: "whatsapp",
              recipient: ownerPhone,
              message: whatsappMsg,
              tenantId,
            }).catch((err) => logger.error("[cron/daily-deal-bundle] WhatsApp enqueue failed", { error: String(err), tenantId }));
            sendPushToPhone(ownerPhone, {
              title: `🔥 Paquete del Día: ${selected.length} productos a S/ ${bundlePrice.toFixed(2)}`,
              body: `${DISCOUNT_PCT}% descuento sobre productos sin ventas esta semana`,
              url: "/admin?module=catalogo",
            }).catch((err) => logger.error("[cron/daily-deal-bundle] push send failed", { error: String(err), tenantId }));
          }
        } catch { /* silent */ }
      })();

      logActivity(
        "daily-deal-bundle",
        "Bundle",
        `Paquete del Día creado con ${selected.length} productos. Precio: S/ ${bundlePrice.toFixed(2)}`,
        undefined,
        "cron"
      ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

      logger.info("[cron/daily-deal-bundle] Paquete creado", {
        tenantId,
        bundleId: bundle.id,
        products: selected.length,
        price: bundlePrice,
      });

      allResults.push({ tenantId, bundleId: bundle.id, bundleName });
      } // end for tenant

      return {
        ok: true,
        tenantsProcessed: tenants.length,
        results: allResults,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/daily-deal-bundle] Error fatal", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
