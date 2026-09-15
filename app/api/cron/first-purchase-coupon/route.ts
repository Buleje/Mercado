import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCronHealth } from "@/lib/cron/with-cron-health";
import { logger } from "@/lib/logger";
import { enqueueNotification } from "@/lib/queue";

/**
 * GET /api/cron/first-purchase-coupon
 *
 * Cron diario. Para cada cliente nuevo (registrado en las últimas 24h)
 * que NO tiene pedidos, genera un cupón de bienvenida del 10%.
 *
 * Audit 2026-05-17 08-P1-1: migrado de withCronAuth → withCronHealth para
 * que las ejecuciones queden en CronHealthLog (consistencia con el resto
 * de crons del audit P0-2). withCronHealth ya valida CRON_SECRET.
 */
export const GET = withCronHealth("first-purchase-coupon", async (_req: NextRequest) => {
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

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30); // 30 days validity

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
      if (newCustomers.length === 0) continue;

      const phones = newCustomers.map((c) => c.phone);
      const codeFor = (phone: string) => `BIENVENIDA-${phone.slice(-4)}`;

      // PERF 2026-05-24: antes era N+1 (order.count + coupon.findFirst + create
      // por customer). Ahora 3 queries batch por tenant: phones-con-orders +
      // cupones-existentes + createMany. De ~3N a ~4 queries/tenant.
      const [withOrders, existingCoupons] = await Promise.all([
        prisma.order.findMany({
          where: { tenantId, customerPhone: { in: phones } },
          select: { customerPhone: true },
          distinct: ["customerPhone"],
        }),
        prisma.coupon.findMany({
          where: { tenantId, code: { in: phones.map(codeFor) } },
          select: { code: true },
        }),
      ]);
      const phonesWithOrders = new Set(withOrders.map((o) => o.customerPhone));
      const existingCodes = new Set(existingCoupons.map((c) => c.code));

      // Filtrar elegibles + dedupe por código (dos phones con mismos últimos 4
      // dígitos colisionan en el código; replica el skip del findFirst original).
      const seenCodes = new Set<string>();
      const eligible: { phone: string; name: string | null; code: string }[] = [];
      for (const customer of newCustomers) {
        if (phonesWithOrders.has(customer.phone)) continue;
        const code = codeFor(customer.phone);
        if (existingCodes.has(code) || seenCodes.has(code)) continue;
        seenCodes.add(code);
        eligible.push({ phone: customer.phone, name: customer.name, code });
      }

      if (eligible.length === 0) continue;

      // Batch insert de todos los cupones del tenant en 1 query.
      await prisma.coupon.createMany({
        data: eligible.map((e) => ({
          code: e.code,
          discountType: "percent",
          discountValue: 10,
          maxUses: 1,
          usedCount: 0,
          minPurchase: 20,
          active: true,
          expiresAt: expiryDate,
          tenantId,
          description: "Cupon de bienvenida - 10% en tu primera compra",
        })),
        // Defensa contra @@unique([tenantId, code]) si el cron corre 2× o
        // colisiona con un cupón creado entre el findMany y el createMany.
        skipDuplicates: true,
      });
      couponsCreated += eligible.length;

      // Notificaciones WhatsApp (fire-and-forget, no bloquean el cron).
      for (const e of eligible) {
        const firstName = e.name?.split(" ")[0] ?? "vecino";
        const whatsappMsg =
          `🎉 ¡Hola ${firstName}! Te damos la bienvenida.\n\n` +
          `Tienes un cupón de *10% de descuento* en tu primera compra:\n\n` +
          `🏷️ Código: *${e.code}*\n` +
          `💰 Mínimo de compra: S/ 20\n` +
          `📅 Válido por 30 días\n\n` +
          `¡Haz tu primer pedido ahora! 🛒`;
        enqueueNotification({
          type: "whatsapp",
          recipient: e.phone,
          message: whatsappMsg,
          tenantId,
          metadata: { purpose: "first-purchase-coupon" },
        }).catch((err) => logger.error("[cron/first-purchase-coupon] WhatsApp enqueue failed", { error: String(err), phone: e.phone, tenantId }));
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
});
