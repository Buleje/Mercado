import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrdersDB, NotificationLogsDB } from "@/lib/jsondb";
import { CouponsDB } from "@/lib/db/coupons.db";
import { SettingsDB } from "@/lib/db/settings.db";
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
import { runWithAuditContext } from "@/lib/audit/audit-context";

const NOTIFIABLE_STATUSES = new Set(["confirmado", "preparando", "en_camino", "entregado", "cancelado"]);

// Valid order status transitions — prevents going backward (e.g. entregado → pendiente)
// Mantener sincronizado con `components/admin/OrdersTab/types.ts:VALID_TRANSITIONS`.
//
// FIX 2026-05-07: agregar entrega manual directa desde confirmado y preparando.
// Antes el dueño TENÍA que mover por "en_camino" antes de "entregado", aunque
// el cliente vino al mostrador o lo entregó sin delivery. Ahora puede saltar
// el paso "en_camino" — útil para negocios sin flota de repartidores.
const VALID_TRANSITIONS: Record<string, string[]> = {
  pendiente: ["confirmado", "cancelado"],
  confirmado: ["preparando", "en_camino", "entregado", "cancelado"],
  preparando: ["en_camino", "entregado", "cancelado"],
  en_camino: ["entregado", "cancelado"],
  entregado: [],    // Terminal state
  cancelado: [],    // Terminal state
};

const PatchSchema = z.object({
  status: z.enum(["pendiente", "confirmado", "preparando", "en_camino", "entregado", "cancelado"]).optional(),
  notes: z.string().max(1000).optional(),
  deuda: z.boolean().nullable().optional(),
  paymentMethod: z.enum(["yape", "efectivo"]).optional(),
  yapeOperationNumber: z.string().max(50).optional(),
  riderName: z.string().max(80).optional(),
  cancelReason: z.string().max(500).optional(),
  adminNote: z.string().max(2000).optional(),
  // FIX 2026-05-07: razón de entrega manual (cuando admin marca entregado
  // sin pasar por en_camino). Se persiste en OrderStatusHistory.note para
  // auditoría — útil para reportes "qué % de entregas son sin delivery".
  deliveryReason: z.string().max(500).optional(),
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
  ctx: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "orders-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  // Round 12 M004: audit log de Order.update (state machine).
  return runWithAuditContext(req, auth.username, () => patchOrder(req, ctx, auth));
}

async function patchOrder(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  auth: { tenantId: string; username: string },
): Promise<NextResponse> {
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

    // deliveryReason NO es columna de Order — se persiste en OrderStatusHistory.note
    // más abajo. Lo separamos del payload del update para que Prisma no falle.
    const { deliveryReason: _deliveryReason, ...updatePayload } = parsed.data;
    void _deliveryReason;
    const updated = await OrdersDB.update(auth.tenantId, id, updatePayload as Partial<DbOrder>);
    if (!updated) return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });

    // Fase 4 perf (2026-05-16): invalidar cache admin tras update (status,
    // total, etc.). Sin esto los KPIs del dashboard mostraban datos stale
    // hasta que expira el getOrSet TTL.
    try {
      const { invalidateAdminCache } = await import("@/lib/admin-cache");
      invalidateAdminCache.afterOrder(auth.tenantId);
    } catch { /* fire-and-forget */ }

    const statusChanged = parsed.data.status != null && parsed.data.status !== existing.status;

    // Log status change to history (fire-and-forget)
    // audit P0 Cal #3 (2026-05-18): migrado a OrdersDB.addStatusHistory
    // (antes prisma.orderStatusHistory.create directo violaba Regla 1).
    if (statusChanged) {
      // FIX 2026-05-07: persistir deliveryReason en el history note para
      // entrega manual. Si no, fallback a cancelReason (cancelaciones).
      const historyNote =
        parsed.data.deliveryReason ?? parsed.data.cancelReason ?? null;
      OrdersDB.addStatusHistory(auth.tenantId, {
        orderId: id,
        fromStatus: existing.status,
        toStatus: parsed.data.status!,
        changedBy: "admin",
        note: historyNote,
      }).catch((err) => logger.warn("[orders/id] background task failed", { orderId: id, err: String(err) }));

      // BUG-01 fix (Bug Hunter Report 2026-04-30):
      // Antes — al cancelar, solo se persistía metadata pero el stock NO se
      // reponía → cada cancelación perdía inventario permanentemente.
      // Ahora — transacción atómica que: 1) repone stock de cada item, 2)
      // persiste cancelReason+cancelledAt. Mismo patrón atómico que el POST
      // (RED-005): UPDATE conditional con tenantId guard.
      if (parsed.data.status === "cancelado") {
        // F4: await — garantiza que el stock se repone antes de responder al cliente.
        // Si la tx falla, el catch loggea el error pero la respuesta HTTP ya se
        // preparó correctamente (el status del pedido sí cambió a cancelado).
        await prismaForTenant(auth.tenantId).$transaction(async (tx) => {
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
      // audit P0 Cal #3 (2026-05-18): migrado a OrdersDB.getItemsForLoyalty
      // — antes prisma.orderItem.findMany directo violaba Regla 1.
      OrdersDB.getItemsForLoyalty(auth.tenantId, id).then((orderItems) => {
        const categoryItems = orderItems.map((oi) => ({
          categorySlug: oi.category,
          lineTotal: oi.price * oi.quantity,
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
    // audit P0 Cal #3 (2026-05-18): migrado a CouponsDB.create — antes
    // prisma.coupon.create directo violaba Regla 1.
    if (statusChanged && parsed.data.status === "entregado") {
      const suffix = id.slice(-5).toUpperCase();
      const couponCode = `VUELVE${suffix}`;
      CouponsDB.create(auth.tenantId, {
        code: couponCode,
        description: "¡Vuelve pronto! 5% de descuento en tu próxima compra",
        discountType: "percent",
        discountValue: 5,
        maxUses: 1,
        expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 días
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
    // Brandon 2026-05-18 (audit P0 #3): findFirst con tenantId — antes era
    // findUnique({where:{phone}}) global. Si TD-040 Phase 3 migra a
    // @@unique([tenantId,phone]), el lookup global empezaría a leer las
    // prefs del primer Customer match cross-tenant. Cerramos el vector ya.
    let custPrefs: { notifOrderUpdates: boolean | null } | null = null;
    if (statusChanged && updated.customer.phone) {
      try {
         
        custPrefs = await prisma.customer.findFirst({
          where: { phone: updated.customer.phone, tenantId: auth.tenantId },
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
        preparando: "👨‍🍳 Estamos preparando tu pedido",
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
      // Branding white-label del tenant para el mensaje WhatsApp.
      // storeName: Settings.businessName → Tenant.name → fallback "Buleje".
      // storeUrl:  dominio propio del tenant (customDomain) si existe.
      let storeName: string | undefined;
      let storeUrl: string | undefined;
      try {
        const s = await SettingsDB.get(auth.tenantId);
        if (s.businessName?.trim()) storeName = s.businessName.trim();
      } catch { /* sigue al fallback */ }
      try {
        const t = await prisma.tenant.findUnique({
          where: { id: auth.tenantId },
          select: { name: true, customDomain: true },
        });
        if (!storeName && t?.name?.trim()) storeName = t.name.trim();
        if (t?.customDomain?.trim()) storeUrl = `https://${t.customDomain.trim()}`;
      } catch { /* sigue al fallback */ }

      const discount = (updated.couponDiscount ?? 0) + (updated.discountAmount ?? 0);
      const orderInfo = {
        id: updated.id,
        customerName: updated.customer.name,
        customerPhone: updated.customer.phone ?? "",
        total: updated.total,
        status: updated.status,
        paymentMethod: updated.paymentMethod,
        deliverySlot: updated.deliverySlot,
        items: updated.items,
        storeName,
        storeUrl,
        discount: discount > 0 ? discount : undefined,
        couponCode: updated.appliedCouponCode ?? undefined,
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
        confirmado: { title: "✅ Pedido confirmado", body: `Tu pedido #${updated.id.slice(-6)} fue confirmado.` },
        preparando: { title: "👨‍🍳 Preparando tu pedido", body: `Estamos preparando tu pedido #${updated.id.slice(-6)}. Pronto sale.` },
        en_camino: { title: "🚚 Pedido en camino", body: `Tu pedido #${updated.id.slice(-6)} va en camino. ¡Prepárate!` },
        entregado: { title: "📦 Pedido entregado", body: `Tu pedido #${updated.id.slice(-6)} fue entregado. ¿Cómo estuvo? Déjanos tu reseña.` },
        cancelado: { title: "❌ Pedido cancelado", body: `Tu pedido #${updated.id.slice(-6)} fue cancelado.` },
      };
      const msg = statusMsgs[parsed.data.status!];
      if (msg) {
         
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
  ctx: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "orders-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  // Round 12 M004: DELETE de Order — Ley 29733 art. 23 obliga trazabilidad.
  return runWithAuditContext(req, auth.username, () => deleteOrder(req, ctx, auth));
}

async function deleteOrder(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  auth: { tenantId: string; username: string },
): Promise<NextResponse> {
  const { id } = await params;
  try {
    await OrdersDB.delete(auth.tenantId, id);
    const reqId = req.headers.get("x-request-id") ?? undefined;
    logActivity("Eliminar", "pedido", `Pedido ${id.slice(-6)} eliminado`, id, auth.username, reqId).catch((err) => logger.warn("[orders/id] background task failed", { orderId: id, err: String(err) }));
    invalidate(`dashboard:${auth.tenantId}`);
    // Fase 4 perf (2026-05-16): invalidación completa de caches admin.
    try {
      const { invalidateAdminCache } = await import("@/lib/admin-cache");
      invalidateAdminCache.afterOrder(auth.tenantId);
    } catch { /* fire-and-forget */ }
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    logger.error("[orders/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
