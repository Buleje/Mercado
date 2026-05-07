import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrdersDB, NotificationLogsDB } from "@/lib/jsondb";
import type { DbOrder } from "@/lib/jsondb";
import { getWhatsAppLink, sendWhatsAppNotification } from "@/lib/whatsapp";
import { logActivity } from "@/lib/activity-logger";
import { requireAdmin } from "@/lib/require-admin";
import { sendPushToPhone } from "@/lib/push-sender";
import { prisma } from "@/lib/prisma";
import { prismaForTenant } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache";
import { autoEarnLoyaltyPoints } from "@/lib/loyalty/auto-earn";
import { applyRateLimit } from "@/lib/rate-limit";

const NOTIFIABLE_STATUSES = new Set(["confirmado", "en_camino", "entregado", "cancelado"]);

// Valid order status transitions — prevents going backward (e.g. entregado → pendiente)
const VALID_TRANSITIONS: Record<string, string[]> = {
  pendiente: ["confirmado", "cancelado"],
  confirmado: ["en_camino", "cancelado"],
  en_camino: ["entregado", "cancelado"],
  entregado: [],    // Terminal state
  cancelado: [],    // Terminal state
};

const PatchSchema = z.object({
  status: z.enum(["pendiente", "confirmado", "en_camino", "entregado", "cancelado"]).optional(),
  notes: z.string().max(1000).optional(),
  deuda: z.boolean().nullable().optional(),
  paymentMethod: z.enum(["yape", "efectivo"]).optional(),
  yapeOperationNumber: z.string().max(50).optional(),
  riderName: z.string().max(80).optional(),
  cancelReason: z.string().max(500).optional(),
  adminNote: z.string().max(2000).optional(),
});

// -- GET /api/orders/[id] -- fetch single order -------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const order = await OrdersDB.getById(auth.tenantId, id);
    if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    return NextResponse.json(order);
  } catch (e) {
    logger.error("[orders/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// -- PATCH /api/orders/[id] -- update status / notes / deuda -----------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "orders-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues.map(i => i.message) },
      { status: 400 }
    );
  }

  try {
    const existing = await OrdersDB.getById(auth.tenantId, id);
    if (!existing) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

    // Validate status transition if attempting to change status
    if (parsed.data.status && parsed.data.status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(parsed.data.status)) {
        return NextResponse.json(
          { error: `No se puede cambiar de "${existing.status}" a "${parsed.data.status}". Transiciones válidas: ${allowed.join(", ") || "ninguna (estado final)"}` },
          { status: 422 }
        );
      }
    }

    const updated = await OrdersDB.update(auth.tenantId, id, parsed.data as Partial<DbOrder>);
    if (!updated) return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });

    const statusChanged = parsed.data.status != null && parsed.data.status !== existing.status;

    // Log status change to history (fire-and-forget)
    if (statusChanged) {
      // eslint-disable-next-line no-restricted-properties -- pre-existing: orderStatusHistory still has direct access; deuda técnica scheduled for migration to lib/db/orders.db.ts. tenantId guard in payload.
      prisma.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: existing.status as never,
          toStatus: parsed.data.status as never,
          changedBy: "admin",
          note: parsed.data.cancelReason ?? null,
          tenantId: auth.tenantId,
        },
      }).catch((err) => logger.warn("[orders/id] background task failed", { orderId: id, err: String(err) }));

      // BUG-01 fix (Bug Hunter Report 2026-04-30):
      // Antes — al cancelar, solo se persistía metadata pero el stock NO se
      // reponía → cada cancelación perdía inventario permanentemente.
      // Ahora — transacción atómica que: 1) repone stock de cada item, 2)
      // persiste cancelReason+cancelledAt. Mismo patrón atómico que el POST
      // (RED-005): UPDATE conditional con tenantId guard.
      if (parsed.data.status === "cancelado") {
        prismaForTenant(auth.tenantId).$transaction(async (tx) => {
          const items = await tx.orderItem.findMany({
            where: { orderId: id },
            select: { productId: true, quantity: true },
          });
          for (const it of items) {
            await tx.$executeRaw`
              UPDATE "Product"
                 SET "stock" = "stock" + ${it.quantity}
               WHERE "id" = ${it.productId}
                 AND "tenantId" = ${auth.tenantId}
                 AND "stock" IS NOT NULL
            `;
          }
          await tx.order.update({
            where: { id },
            data: {
              cancelReason: parsed.data.cancelReason ?? null,
              cancelledAt: new Date(),
            },
          });
          logger.info("[orders/cancel] stock reverted + metadata persisted", {
            orderId: id,
            tenantId: auth.tenantId,
            itemsReverted: items.length,
          });
        }).catch((err) => {
          logger.error("[orders/cancel] revert+metadata transaction failed", {
            orderId: id,
            tenantId: auth.tenantId,
            err: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }

    // Auto-earn de puntos de lealtad al completar la entrega — fire-and-forget.
    // autoEarnLoyaltyPoints maneja: mínimo S/5, 1pto/S/1,(×2 para frescos, etc.),
    // anti-duplicación por orderId, niveles Bronce/Plata/Oro/Diamante y audit trail.
    if (statusChanged && parsed.data.status === "entregado" && updated.customer.phone) {
      // Fetch order items with product categories for multiplier calculation.
      // eslint-disable-next-line no-restricted-properties -- pre-existing: orderItem read scoped por orderId; migracion a lib/db/orders.db.ts pendiente.
      prisma.orderItem.findMany({
        where: { orderId: id },
        select: {
          price: true,
          quantity: true,
          product: { select: { category: true } },
        },
      }).then((orderItems) => {
        const categoryItems = orderItems.map((oi) => ({
          categorySlug: oi.product?.category ?? null,
          lineTotal: Number(oi.price) * oi.quantity,
        }));
        return autoEarnLoyaltyPoints(
          auth.tenantId,
          updated.customer.phone!,
          id,
          updated.total,
          categoryItems.length > 0 ? categoryItems : undefined,
        );
      }).catch((err) => logger.warn("[orders/id] background task failed", { orderId: id, err: String(err) }));
    }

    // Auto-coupon "Vuelve pronto" 5% on delivery (fire-and-forget)
    if (statusChanged && parsed.data.status === "entregado") {
      const suffix = id.slice(-5).toUpperCase();
      const couponCode = `VUELVE${suffix}`;
      // eslint-disable-next-line no-restricted-properties -- pre-existing: coupon side-effect; tenantId in payload. Migration to lib/db/coupons.db.ts pendiente.
      prisma.coupon.create({
        data: {
          code: couponCode,
          tenantId: auth.tenantId,
          description: "¡Vuelve pronto! 5% de descuento en tu próxima compra",
          discountType: "percent",
          discountValue: 5,
          maxUses: 1,
          usedCount: 0,
          active: true,
          expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 días
        },
      }).then(() => {
        // Notify customer about coupon via push + WhatsApp
        if (updated.customer.phone) {
          sendPushToPhone(updated.customer.phone, {
            title: "🎁 ¡Tienes un cupón de regalo!",
            body: `Usa el código ${couponCode} y obtén 5% de descuento en tu próxima compra. Válido por 15 días.`,
            url: "/",
          }).catch((err) => logger.warn("[orders/id] background task failed", { orderId: id, err: String(err) }));
          sendWhatsAppNotification({
            id: updated.id,
            customerName: updated.customer.name,
            customerPhone: updated.customer.phone,
            total: updated.total,
            status: "entregado",
            paymentMethod: updated.paymentMethod,
            deliverySlot: updated.deliverySlot,
            items: updated.items,
          }).catch((err) => logger.warn("[orders/id] background task failed", { orderId: id, err: String(err) }));
        }
      }).catch((err) => logger.warn("[orders/id] background task failed", { orderId: id, err: String(err) }));
    }

    // Check customer notification preferences for order updates.
    let custPrefs: { notifOrderUpdates: boolean | null } | null = null;
    if (statusChanged && updated.customer.phone) {
      try {
        // eslint-disable-next-line no-restricted-properties -- pre-existing: lookup global por phone; deuda pendiente migrar a lib/db/customers.db.ts.
        custPrefs = await prisma.customer.findUnique({
          where: { phone: updated.customer.phone },
          select: { notifOrderUpdates: true },
        });
      } catch (err) {
        logger.warn("[orders/id] customer prefs lookup failed", { phone: updated.customer.phone, err: String(err) });
      }
    }
    const wantsOrderNotifs = custPrefs?.notifOrderUpdates !== false;

    if (statusChanged && parsed.data.status === "entregado" && updated.customer.phone && wantsOrderNotifs) {
      // Send push notification with review prompt
      sendPushToPhone(updated.customer.phone, {
        title: "✅ ¡Pedido entregado!",
        body: `Tu pedido de S/${updated.total.toFixed(2)} fue entregado. ¿Cómo estuvo? Déjanos tu reseña 🌟`,
        url: `/pedido/${updated.id}`,
      }).catch((err) => logger.warn("[orders/id] background task failed", { orderId: id, err: String(err) }));
    }

    // Send push for other status changes
    if (statusChanged && parsed.data.status !== "entregado" && updated.customer.phone && NOTIFIABLE_STATUSES.has(parsed.data.status!) && wantsOrderNotifs) {
      const statusLabels: Record<string, string> = {
        confirmado: "✅ Pedido confirmado",
        en_camino: "🚚 Tu pedido va en camino",
        cancelado: "❌ Pedido cancelado",
      };
      sendPushToPhone(updated.customer.phone, {
        title: statusLabels[parsed.data.status!] ?? "Actualización de pedido",
        body: `Pedido #${updated.id.slice(-6)} — S/${updated.total.toFixed(2)}`,
        url: `/pedido/${updated.id}`,
      }).catch((err) => logger.warn("[orders/id] background task failed", { orderId: id, err: String(err) }));
    }

    // Build WhatsApp link when status advances to a customer-facing state
    let whatsappLink: string | null = null;
    let whatsappSent = false;
    if (statusChanged && NOTIFIABLE_STATUSES.has(parsed.data.status!)) {
      const orderInfo = {
        id: updated.id,
        customerName: updated.customer.name,
        customerPhone: updated.customer.phone ?? "",
        total: updated.total,
        status: updated.status,
        paymentMethod: updated.paymentMethod,
        deliverySlot: updated.deliverySlot,
        items: updated.items,
      };

      // Try auto-sending via WhatsApp API first (respects customer preference)
      try {
        if (wantsOrderNotifs) {
          whatsappSent = await sendWhatsAppNotification(orderInfo);
        }
      } catch { /* API not configured or failed — fall back to link */ }

      // Always generate the manual link as fallback
      whatsappLink = getWhatsAppLink(orderInfo);

      // Log notification (fire-and-forget)
      if (updated.customer.phone) {
        NotificationLogsDB.add({
          type: `order_${updated.status}`,
          recipient: updated.customer.phone,
          message: whatsappSent
            ? `WhatsApp auto-enviado: estado -> ${updated.status}`
            : `WhatsApp link generado: estado -> ${updated.status}`,
          status: whatsappSent ? "sent" : whatsappLink ? "link" : "skipped",
          orderId: updated.id,
        }, auth.tenantId).catch((err) => logger.warn("[orders/id] background task failed", { orderId: id, err: String(err) }));
      }
    }

    const requestId = req.headers.get("x-request-id") ?? undefined;
    logActivity(
      "Actualizar", "pedido",
      `Pedido ${id.slice(-6)}${parsed.data.status ? ` -> ${parsed.data.status}` : " editado"}`,
      id,
      "admin",
      requestId,
    ).catch((err) => logger.warn("[orders/id] background task failed", { orderId: id, err: String(err) }));

    // Log to customer notification inbox
    if (statusChanged && updated.customer.phone && NOTIFIABLE_STATUSES.has(parsed.data.status!)) {
      const statusMsgs: Record<string, { title: string; body: string }> = {
        confirmado: { title: "✅ Pedido confirmado", body: `Tu pedido #${updated.id.slice(-6)} fue confirmado. Estamos preparándolo.` },
        en_camino: { title: "🚚 Pedido en camino", body: `Tu pedido #${updated.id.slice(-6)} va en camino. ¡Prepárate!` },
        entregado: { title: "📦 Pedido entregado", body: `Tu pedido #${updated.id.slice(-6)} fue entregado. ¿Cómo estuvo? Déjanos tu reseña.` },
        cancelado: { title: "❌ Pedido cancelado", body: `Tu pedido #${updated.id.slice(-6)} fue cancelado.` },
      };
      const msg = statusMsgs[parsed.data.status!];
      if (msg) {
        // eslint-disable-next-line no-restricted-properties -- pre-existing direct prisma access, scheduled for migration to lib/db/customer-notifications.db.ts. Tenant guard explicit via tenantId field.
        prisma.customerNotification.create({
          data: {
            tenantId: auth.tenantId,
            customerPhone: updated.customer.phone,
            type: "order",
            title: msg.title,
            body: msg.body,
            link: `/pedido/${updated.id}`,
          },
        }).catch((err) => logger.warn("[orders/id] background task failed", { orderId: id, err: String(err) }));
      }
    }

    invalidate(`dashboard:${auth.tenantId}`);
    return NextResponse.json({ ...updated, ...(whatsappLink && { whatsappLink }), ...(whatsappSent && { whatsappSent }) });
  } catch (e) {
    logger.error("[orders/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// -- DELETE /api/orders/[id] -- remove order ----------------------------------
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "orders-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    await OrdersDB.delete(auth.tenantId, id);
    const reqId = req.headers.get("x-request-id") ?? undefined;
    logActivity("Eliminar", "pedido", `Pedido ${id.slice(-6)} eliminado`, id, "admin", reqId).catch((err) => logger.warn("[orders/id] background task failed", { orderId: id, err: String(err) }));
    invalidate(`dashboard:${auth.tenantId}`);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    logger.error("[orders/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
