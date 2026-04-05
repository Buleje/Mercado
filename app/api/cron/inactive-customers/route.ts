export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendPushToPhone } from "@/lib/push-sender";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/inactive-customers
 *
 * Busca clientes que no compran hace 15 días y les envía un recordatorio
 * por WhatsApp + Push con un mensaje personalizado basado en su última compra.
 *
 * Lógica:
 * 1. Buscar clientes cuya última orden fue hace 14-16 días (ventana de 2 días)
 * 2. Solo clientes con teléfono y que no hayan sido contactados recientemente
 * 3. Enviar WhatsApp + Push con productos que compraron la última vez
 * 4. Máximo 100 clientes por ejecución (no saturar APIs)
 *
 * Sugerencia vercel.json: "0 11 * * *" (11:00 AM diario)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("inactive-customers", async () => {
      const now = Date.now();
      // Window: last order between 14 and 16 days ago
      const windowStart = new Date(now - 16 * 24 * 60 * 60 * 1000);
      const windowEnd = new Date(now - 14 * 24 * 60 * 60 * 1000);

      // Find customers whose LAST order falls in the 14-16 day window
      const candidates = await prisma.order.groupBy({
        by: ["customerPhone"],
        where: {
          deletedAt: null,
          customerPhone: { not: "" },
          status: { in: ["entregado", "confirmado", "en_camino"] },
        },
        _max: { createdAt: true },
        having: {
          createdAt: {
            _max: { gte: windowStart, lte: windowEnd },
          },
        },
        orderBy: { customerPhone: "asc" },
        take: 100,
      });

      if (candidates.length === 0) {
        logger.info("[cron/inactive-customers] Nadie inactivo en la ventana de 14-16 días");
        return { ok: true, reminded: 0, candidates: 0 };
      }

      let reminded = 0;

      for (const candidate of candidates) {
        const phone = candidate.customerPhone;
        if (!phone) continue;

        // Check if we already sent a reminder recently (prevent spam)
        const recentNotif = await prisma.notificationLog.findFirst({
          where: {
            recipient: phone,
            type: "inactive_reminder",
            createdAt: { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) },
          },
        }).catch(() => null);

        if (recentNotif) continue; // Already reminded within 7 days

        // Get last order details for personalization
        const lastOrder = await prisma.order.findFirst({
          where: {
            customerPhone: phone,
            deletedAt: null,
          },
          select: {
            customerName: true,
            tenantId: true,
            items: { select: { name: true }, take: 3 },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!lastOrder) continue;

        const customerName = lastOrder.customerName?.split(" ")[0] ?? "vecino";
        const products = lastOrder.items.map((i) => i.name).join(", ");

        // Get tenant/store name
        const tenant = await prisma.tenant.findFirst({
          where: { slug: lastOrder.tenantId },
          select: { name: true },
        }).catch(() => null);

        const storeName = tenant?.name ?? "tu bodega favorita";

        const message =
          `👋 ¡Hola ${customerName}!\n\n` +
          `Te extrañamos en *${storeName}* 🏪\n\n` +
          `La última vez compraste: ${products}\n` +
          `¿Necesitas reabastecer? ¡Hacemos delivery rápido a tu puerta! 🛵\n\n` +
          `Entra a nuestra tienda y haz tu pedido fácil 👉`;

        // Send WhatsApp (fire-and-forget)
        sendWhatsAppText(phone, message).catch(() => {});

        // Send Push (fire-and-forget)
        sendPushToPhone(phone, {
          title: `👋 ¡Te extrañamos, ${customerName}!`,
          body: `¿Necesitas ${lastOrder.items[0]?.name ?? "algo"}? Pide ahora con delivery rápido.`,
          url: "/tienda",
        }).catch(() => {});

        // Log notification to prevent duplicates
        prisma.notificationLog.create({
          data: {
            type: "inactive_reminder",
            recipient: phone,
            message: `Reminder 15d: ${customerName} — ${products}`,
            status: "sent",
          },
        }).catch(() => {});

        reminded++;
      }

      logActivity("cron", "inactive-customers", `Enviados ${reminded} recordatorios de ${candidates.length} candidatos`).catch(() => {});
      logger.info(`[cron/inactive-customers] ${reminded}/${candidates.length} recordatorios enviados`);

      return { ok: true, reminded, candidates: candidates.length };
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error("[cron/inactive-customers] Error", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
