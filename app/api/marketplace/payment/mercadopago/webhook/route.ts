import { NextRequest, NextResponse } from "next/server";
import { getMercadoPagoPayment, verifyMPWebhookSignature } from "@/lib/mercadopago";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { sendPushToPhone } from "@/lib/push-sender";
import { createNotification } from "@/lib/create-notification";
import { logger } from "@/lib/logger";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { OrderStatus } from "@/lib/generated/prisma/client";

// POST /api/marketplace/payment/mercadopago/webhook
// Handles MercadoPago IPN notifications for marketplace orders
export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const body = await req.json().catch(() => ({}));

    // Only process payment notifications
    if (body.type !== "payment" && body.action !== "payment.created" && body.action !== "payment.updated") {
      return NextResponse.json({ received: true });
    }

    const dataId = body.data?.id || body.id;
    if (!dataId) {
      return NextResponse.json({ error: "No data.id" }, { status: 400 });
    }

    // SECURITY: secret OBLIGATORIO. Sin él, atacantes pueden mutar
    // órdenes de cualquier tenant via POST anónimo (vector demanda Ley 29733).
    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error("[MP webhook] MERCADOPAGO_WEBHOOK_SECRET no configurado", { traceId });
      return NextResponse.json(
        { error: "Webhook secret no configurado" },
        { status: 503 },
      );
    }
    const xSignature = req.headers.get("x-signature") || "";
    const xRequestId = req.headers.get("x-request-id") || "";
    const isValid = verifyMPWebhookSignature({
      xSignature,
      xRequestId,
      dataId: String(dataId),
      secret: webhookSecret,
    });
    if (!isValid) {
      logger.warn("MP webhook: firma inválida", { traceId, dataId });
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }

    // Fetch payment details from MP
    const payment = await getMercadoPagoPayment(dataId);
    const externalRef = payment.external_reference || "";
    const [storeSlug, orderId] = externalRef.split("::");

    if (!orderId) {
      logger.warn("MP webhook: external_reference sin orderId", { traceId, externalRef });
      return NextResponse.json({ received: true });
    }

    const paymentStatus = payment.status; // approved, rejected, pending, in_process
    logger.info("MP webhook: payment received", { traceId, orderId, paymentStatus, storeSlug });

    // Map MP status to order status
    let orderStatus: OrderStatus | null = null;
    if (paymentStatus === "approved") {
      orderStatus = OrderStatus.confirmado;
    } else if (paymentStatus === "rejected" || paymentStatus === "cancelled") {
      orderStatus = OrderStatus.cancelado;
    }
    // pending / in_process → don't change order status yet

    if (orderStatus) {
      // SECURITY: scope por tenantId del store derivado del storeSlug
      // (no del payload externo). Si el slug no resuelve a un store o
      // el orderId no pertenece a ese tenant, NO mutamos.
      const storeForUpdate = await prisma.store.findFirst({
        where: { slug: storeSlug },
        select: { tenantId: true },
      });
      if (!storeForUpdate) {
        logger.warn("[MP webhook] storeSlug desconocido — no update", { traceId, storeSlug, orderId });
        return NextResponse.json({ received: true, ignored: true });
      }
      const updated = await prisma.order.updateMany({
        where: { id: orderId, tenantId: storeForUpdate.tenantId },
        data: {
          status: orderStatus,
          paymentMethod: "mercado_pago",
        },
      });
      if (updated.count === 0) {
        logger.warn("[MP webhook] orderId no pertenece al tenant del storeSlug — posible cross-tenant attack", {
          traceId, orderId, storeSlug, tenantId: storeForUpdate.tenantId,
        });
        return NextResponse.json({ received: true, ignored: true });
      }

      // Fire-and-forget: notify store owner
      (async () => {
        try {
          const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { tenantId: true, customerName: true, customerPhone: true, total: true },
          });
          if (!order) return;

          if (paymentStatus === "approved") {
            createNotification({
              tenantId: order.tenantId,
              type: "marketplace_payment",
              severity: "HIGH",
              title: `Pago confirmado — S/${Number(order.total).toFixed(2)}`,
              body: `${order.customerName} pagó con Mercado Pago. ¡Prepara el pedido!`,
              actionUrl: `/admin?module=marketplace&tab=ordenes`,
              actionLabel: "Ver pedido",
              entityId: orderId,
            }).catch((err) => logger.error("[marketplace/payment/mercadopago/webhook] operation failed", { error: String(err) }));

            // Notify customer
            if (order.customerPhone) {
              sendWhatsAppQueued(
                order.customerPhone,
                `✅ Tu pago de S/ ${Number(order.total).toFixed(2)} fue confirmado.\n\n` +
                `Pedido: ${orderId.slice(0, 8)}…\n` +
                `El vendedor está preparando tu pedido. 🛒`,
                { tenantId: order.tenantId, context: "mercadopago-payment-confirmed" },
              ).catch((err) => { logger.warn("[MP webhook] customer WA notify failed", { traceId, orderId, error: String(err) }); });
            }

            // Notify store owner
            const store = await prisma.store.findFirst({
              where: { slug: storeSlug },
              select: { tenantId: true, name: true },
            });
            if (store) {
              const tenant = await prisma.tenant.findUnique({
                where: { slug: store.tenantId },
                select: { ownerPhone: true },
              });
              if (tenant?.ownerPhone) {
                sendPushToPhone(tenant.ownerPhone, {
                  title: `💳 Pago MP confirmado — ${store.name}`,
                  body: `${order.customerName} pagó S/${Number(order.total).toFixed(2)} con Mercado Pago`,
                  url: `/admin?module=marketplace&tab=ordenes`,
                }).catch((err) => logger.error("[marketplace/payment/mercadopago/webhook] operation failed", { error: String(err) }));
              }
            }
          }
        } catch { /* silent */ }
      })();
    }

    return NextResponse.json({ received: true, orderId, status: paymentStatus });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
