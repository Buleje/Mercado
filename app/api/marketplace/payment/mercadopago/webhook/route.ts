import { NextRequest, NextResponse } from "next/server";
import { getMercadoPagoPayment, verifyMPWebhookSignature } from "@/lib/mercadopago";
import { prisma } from "@/lib/prisma";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { sendPushToPhone } from "@/lib/push-sender";
import { createNotification } from "@/lib/create-notification";
import { logger } from "@/lib/logger";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { OrderStatus } from "@/lib/generated/prisma/client";
import { withAuditContext } from "@/lib/audit/audit-context";
import { getClientIp } from "@/lib/rate-limit";

/**
 * @prisma-direct excepción documentada — el `prisma.order.updateMany` y el
 * `prisma.tenant.findUnique` se mantienen porque (a) updateMany ya aplica
 * `tenantId` explícito (no hay método equivalente atómico en OrdersDB para
 * cambio de status + paymentMethod simultáneo) y (b) tenant lookup por
 * slug es un caso administrativo de webhook. Ambas operaciones tienen
 * scope explícito por tenantId.
 */

// POST /api/marketplace/payment/mercadopago/webhook
// Handles MercadoPago IPN notifications for marketplace orders
export async function POST(req: NextRequest) {
  // Round 15 M004: webhook externo MercadoPago. userId="mp:webhook" para
  // distinguir transiciones de Order originadas por IPN de las de admin.
  return withAuditContext(
    {
      ipAddress: getClientIp(req),
      userId: "mp:webhook",
      requestId: req.headers.get("x-request-id"),
    },
    () => mpWebhookHandler(req),
  );
}

async function mpWebhookHandler(req: NextRequest): Promise<NextResponse> {
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

    // SECURITY 2026-05-06 (audit pagos M006): idempotency lock. Antes 2
    // eventos `payment.updated` simultáneos disparaban 2 notificaciones
    // WhatsApp + 2 push al cliente y al vendor. Ahora UNIQUE constraint
    // en stripeWebhookQueue.stripeId nos sirve también para MP marketplace.
    const idemKey = `mpmkt_${dataId}`;
    try {
      await prisma.stripeWebhookQueue.create({
        data: {
          stripeId: idemKey,
          eventType: body.type ?? "payment",
          payload: JSON.stringify(body).slice(0, 50_000),
          processedAt: new Date(),
        },
      });
    } catch (err) {
      // P2002 = unique violation = ya procesado
      const code = (err as { code?: string })?.code;
      if (code === "P2002") {
        logger.info("MP webhook: duplicate event ignored", { traceId, dataId });
        return NextResponse.json({ received: true, duplicate: true });
      }
      // Si la tabla no existe (schema drift) seguimos sin lock — degradación
      // graceful en dev. En prod la tabla existe.
      logger.warn("MP webhook: idempotency lock failed (continuando)", { traceId, err: String(err) });
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
      // Para webhook usamos query directo (no getBySlug) porque tiendas
      // suspendidas también pueden recibir webhooks de pagos previos.
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
          // Query directo con scope `tenantId` explícito (cierra cross-tenant
          // aún dentro del fire-and-forget). DbOrder de OrdersDB.getById tiene
          // forma diferente — para webhook usamos shape específico.
          const order = await prisma.order.findFirst({
            where: { id: orderId, tenantId: storeForUpdate.tenantId },
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

            // Notify store owner — getBySlug filtra isPublished pero los
            // pagos confirmados también notifican aunque el store esté en
            // pausa. Para esa edge case usamos query directo con scope.
            const store = await MarketplaceStoresDB.getBySlug(storeSlug);
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
