import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { logger } from "@/lib/logger";
import { enqueueNotification } from "@/lib/queue";

/**
 * GET /api/cron/first-purchase-coupon
 *
 * Cron diario. Para cada cliente nuevo (registrado en las últimas 24h)
 * que NO tiene pedidos, genera un cupón de bienvenida del 10%.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Iterate over all active tenants (multi-tenant)
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true },
    });

    let couponsCreated = 0;
    let totalNewCustomers = 0;

    for (const tenant of tenants) {
      const tenantId = tenant.id;

      // Find customers registered in the last 24h for this tenant
      const newCustomers = await prisma.customer.findMany({
        where: {
          tenantId,
          createdAt: { gte: yesterday },
        },
        select: { phone: true, name: true },
      });
      totalNewCustomers += newCustomers.length;

      for (const customer of newCustomers) {
        // Check if customer already has orders in this tenant
        const orderCount = await prisma.order.count({
          where: { tenantId, customerPhone: customer.phone },
        });

        if (orderCount > 0) continue;

        // Check if coupon already exists for this customer in this tenant
        const existingCoupon = await prisma.coupon.findFirst({
          where: {
            tenantId,
            code: `BIENVENIDA-${customer.phone.slice(-4)}`,
          },
        });

        if (existingCoupon) continue;

        // Create welcome coupon
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30); // 30 days validity

        await prisma.coupon.create({
          data: {
            code: `BIENVENIDA-${customer.phone.slice(-4)}`,
            discountType: "percent",
            discountValue: 10,
            maxUses: 1,
            usedCount: 0,
            minPurchase: 20,
            active: true,
            expiresAt: expiryDate,
            tenantId,
            description: "Cupon de bienvenida - 10% en tu primera compra",
          },
        });

        couponsCreated++;

        // Send WhatsApp with the coupon code
        const firstName = customer.name?.split(" ")[0] ?? "vecino";
        const couponCode = `BIENVENIDA-${customer.phone.slice(-4)}`;
        const whatsappMsg =
          `🎉 ¡Hola ${firstName}! Te damos la bienvenida.\n\n` +
          `Tienes un cupón de *10% de descuento* en tu primera compra:\n\n` +
          `🏷️ Código: *${couponCode}*\n` +
          `💰 Mínimo de compra: S/ 20\n` +
          `📅 Válido por 30 días\n\n` +
          `¡Haz tu primer pedido ahora! 🛒`;
        enqueueNotification({
          type: "whatsapp",
          recipient: customer.phone,
          message: whatsappMsg,
          tenantId,
          metadata: { purpose: "first-purchase-coupon" },
        }).catch(() => {});

        logger.info("[cron/first-purchase-coupon] Cupón creado", {
          tenantId,
          customer: customer.name,
          code: `BIENVENIDA-${customer.phone.slice(-4)}`,
        });
      }
    } // end for tenant

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      newCustomers: totalNewCustomers,
      couponsCreated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/first-purchase-coupon] Error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
