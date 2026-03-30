export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { createNotification } from "@/lib/create-notification";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/birthday-greetings
 *
 * Cron diario (8am). Busca clientes cuyo cumpleanos es HOY,
 * crea cupon de cumpleanos y notificacion con link wa.me.
 *
 * Autorizacion: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    const year = today.getFullYear();

    // 1. Buscar clientes con cumpleanos registrado
    const customersWithBday = await prisma.customer.findMany({
      where: { birthday: { not: null } },
      select: {
        phone: true,
        name: true,
        birthday: true,
        tenantId: true,
      },
    });

    // 2. Filtrar los que cumplen hoy
    const birthdayCustomers = customersWithBday.filter((c) => {
      if (!c.birthday) return false;
      const bday = new Date(c.birthday);
      return bday.getMonth() === todayMonth && bday.getDate() === todayDate;
    });

    let greetingsCount = 0;

    for (const customer of birthdayCustomers) {
      const cleanPhone = customer.phone.replace(/\D/g, "");
      const couponCode = `CUMPLE-${cleanPhone}-${year}`;

      // 3. Crear cupon si no existe uno activo para este anio
      const existingCoupon = await prisma.coupon.findFirst({
        where: {
          tenantId: customer.tenantId,
          code: couponCode,
        },
      });

      let couponCreated = false;

      if (!existingCoupon) {
        const validTo = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        await prisma.coupon.create({
          data: {
            code: couponCode,
            tenantId: customer.tenantId,
            description: `Cupon de cumpleanos para ${customer.name}`,
            discountType: "percent",
            discountValue: 10,
            maxUses: 1,
            active: true,
            expiresAt: validTo,
          },
        });
        couponCreated = true;
      }

      // 4. Mensaje WhatsApp pre-formateado
      const mensaje = `Feliz cumpleanos ${customer.name}! Te regalamos 10% de descuento en tu proxima compra. Usa el codigo: ${couponCode}. Valido por 7 dias. Buleje!`;
      const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(mensaje)}`;

      // 5. Crear notificacion
      await createNotification({
        tenantId: customer.tenantId,
        type: "CUMPLEANOS",
        severity: "LOW",
        title: `Hoy cumple ${customer.name}!`,
        body: couponCreated
          ? `Cupon ${couponCode} creado (10% desc, valido 7 dias). Envia felicitacion por WhatsApp.`
          : `Cupon ${couponCode} ya existia. Envia felicitacion por WhatsApp.`,
        actionUrl: waLink,
        actionLabel: "Felicitar",
        entityId: `bday-${cleanPhone}-${year}`,
      });

      greetingsCount++;
    }

    logActivity(
      "cron",
      "customer",
      `Birthday-greetings: ${birthdayCustomers.length} cumpleaneros, ${greetingsCount} felicitaciones enviadas`,
      undefined,
      "cron",
    ).catch(() => {});

    logger.info("[cron/birthday-greetings]", {
      checked: customersWithBday.length,
      birthdayToday: birthdayCustomers.length,
      greetings: greetingsCount,
    });

    return NextResponse.json({
      ok: true,
      checked: customersWithBday.length,
      birthdayToday: birthdayCustomers.length,
      greetings: greetingsCount,
      processedAt: today.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/birthday-greetings] Error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
