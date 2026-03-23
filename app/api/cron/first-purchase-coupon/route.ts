export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { logger } from "@/lib/logger";

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

    // Find customers registered in the last 24h
    const newCustomers = await prisma.customer.findMany({
      where: {
        createdAt: { gte: yesterday },
      },
      select: { phone: true, name: true },
    });

    let couponsCreated = 0;

    for (const customer of newCustomers) {
      // Check if customer already has orders
      const orderCount = await prisma.order.count({
        where: { customerPhone: customer.phone },
      });

      if (orderCount > 0) continue;

      // Check if coupon already exists for this customer
      const existingCoupon = await prisma.coupon.findFirst({
        where: {
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
          tenantId: "main",
          description: "Cupon de bienvenida - 10% en tu primera compra",
        },
      });

      couponsCreated++;
      logger.info("[cron/first-purchase-coupon] Cupón creado", {
        customer: customer.name,
        code: `BIENVENIDA-${customer.phone.slice(-4)}`,
      });
    }

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      newCustomers: newCustomers.length,
      couponsCreated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/first-purchase-coupon] Error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
