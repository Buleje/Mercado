import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/loyalty-points-reminder
 *
 * Envía un recordatorio mensual por WhatsApp a clientes con ≥50 puntos
 * sin canjear, avisándoles que pueden usarlos como descuento.
 *
 * Sugerencia vercel.json: "0 10 1 * *" (1ero de cada mes a las 10 AM)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("loyalty-points-reminder", async () => {
      // Find all active tenants
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, name: true },
      });

      let totalSent = 0;

      for (const tenant of tenants) {
        // Find customers with ≥50 unused points (enough to redeem S/1)
        const customers = await prisma.customer.findMany({
          where: {
            tenantId: tenant.id,
            loyaltyPoints: { gte: 50 },
            phone: { not: "" },
          },
          select: {
            phone: true,
            name: true,
            loyaltyPoints: true,
            loyaltyTier: true,
          },
          take: 200, // Cap per tenant to avoid API saturation
        });

        for (const c of customers) {
          const solesValue = Math.floor(c.loyaltyPoints / 50);
          const message =
            `Hola ${c.name ?? ""}! Tienes *${c.loyaltyPoints} puntos* acumulados en ${tenant.name ?? "tu bodega"} ` +
            `(equivalen a *S/${solesValue} de descuento*).\n\n` +
            `Puedes canjearlos la proxima vez que compres. ` +
            `No los dejes guardados, usalos!`;

          sendWhatsAppText(c.phone, message).catch(() => {});
          totalSent++;
        }
      }

      return { sent: totalSent, tenants: tenants.length };
    });

    logger.info("[cron/loyalty-points-reminder] completed", result);
    return NextResponse.json(result);
  } catch (err) {
    logger.error("[cron/loyalty-points-reminder] error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Cron failed" },
      { status: 500 },
    );
  }
}
