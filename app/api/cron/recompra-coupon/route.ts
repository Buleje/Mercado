import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/recompra-coupon
 *
 * Busca clientes que hicieron su PRIMERA compra hace exactamente 7 días
 * y les envía un cupón de descuento por WhatsApp para incentivar la recompra.
 *
 * Sugerencia vercel.json: "0 10 * * *" (10:00 AM cada día)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("recompra-coupon", async () => {
      const now = new Date();

      // Rango: clientes que se registraron hace 7 días (±12h ventana)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const windowStart = new Date(sevenDaysAgo.getTime() - 12 * 60 * 60 * 1000);
      const windowEnd = new Date(sevenDaysAgo.getTime() + 12 * 60 * 60 * 1000);

      // Buscar clientes con exactamente 1 orden (primera compra) hace 7 días
      const candidates = await prisma.customer.findMany({
        where: {
          createdAt: { gte: windowStart, lte: windowEnd },
          phone: { not: "" },
        },
        select: {
          // Customer no tiene campo 'id' — su PK es 'phone'
          name: true,
          phone: true,
          tenantId: true,
        },
        take: 200,
      });

      if (candidates.length === 0) {
        return { ok: true, sent: 0, message: "No hay clientes elegibles hoy" };
      }

      let sent = 0;
      const errors: string[] = [];

      for (const customer of candidates) {
        try {
          // Verificar que tiene exactamente 1 orden (primera compra)
          const orderCount = await prisma.order.count({
            where: { customerPhone: customer.phone, tenantId: customer.tenantId },
          });
          if (orderCount !== 1) continue;

          // Verificar que no tiene ya un cupón de recompra
          const existingCode = `VUELVE-${customer.phone.slice(-4)}`;
          const existing = await prisma.coupon.findFirst({
            where: { code: existingCode, tenantId: customer.tenantId },
          });
          if (existing) continue;

          // Crear cupón de 10% con validez de 14 días
          const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
          await prisma.coupon.create({
            data: {
              code: existingCode,
              description: `Cupón de recompra para ${customer.name}`,
              discountType: "percent",
              discountValue: 10,
              minPurchase: 15,
              maxUses: 1,
              active: true,
              expiresAt,
              tenantId: customer.tenantId,
            },
          });

          // Enviar por WhatsApp (fire-and-forget)
          const message = [
            `🏪 *Buleje*`,
            `━━━━━━━━━━━━━━━━━━━`,
            `🎉 *¡Descuento especial para ti!*`,
            ``,
            `Hola *${customer.name}* 👋`,
            ``,
            `Hace una semana hiciste tu primera compra con nosotros y queremos agradecerte con un regalo:`,
            ``,
            `🎫 *Cupón: ${existingCode}*`,
            `💰 *10% de descuento* en tu próxima compra`,
            `📅 Válido por 14 días`,
            `🛒 Compra mínima: S/ 15.00`,
            ``,
            `¡Solo ingresa el código al pagar! 🛍️`,
            ``,
            `─────`,
            `_Gracias por confiar en Buleje_ 🙏`,
          ].join("\n");

          enqueueNotification({
            type: "whatsapp",
            recipient: customer.phone,
            message,
            tenantId: customer.tenantId,
          }).catch(() => {});
          sent++;
        } catch (err) {
          errors.push(`${customer.phone}: ${err instanceof Error ? err.message : "error"}`);
        }
      }

      logger.info("[cron/recompra-coupon] Cupones enviados", { sent, total: candidates.length });

      logActivity(
        "recompra-coupon",
        "Coupon",
        `${sent} cupones de recompra enviados a clientes de hace 7 días`,
        undefined,
        "cron"
      ).catch(() => {});

      return {
        ok: true,
        sent,
        candidates: candidates.length,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
        processedAt: now.toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/recompra-coupon] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
