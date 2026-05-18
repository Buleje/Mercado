/**
 * @prisma-direct ok — operación con scope explícito por `auth.tenantId` o
 * por `tenantId` resuelto desde slug del URL antes de la query. Aislamiento
 * cross-tenant verificado manualmente. Migrar a clase `lib/db/*.db.ts`
 * dedicada cuando se centralice el patrón.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";
import { sendPushToPhone } from "@/lib/push-sender";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { PrismaOrderRepository } from "@/lib/db/adapters/prisma-order-repository";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { MarketplaceOrdersDB } from "@/lib/db/marketplace.db";

const orderRepo = new PrismaOrderRepository();

// ── Valid marketplace order status transitions ────────────────────────────────

// Brandon mayo 2026 v7 (Nivel B): `preparando` agregado como paso intermedio
// real entre confirmar y salir a entregar (la bodega arma el pedido). Brandon
// pidió que cocina/almacén pueda marcar este estado sin tener que saltar a
// "en_camino" antes de que esté listo.
const VALID_TRANSITIONS: Record<string, string[]> = {
  pendiente:  ["confirmado", "cancelado"],
  confirmado: ["preparando", "en_camino", "cancelado"],
  preparando: ["en_camino", "cancelado"],
  en_camino:  ["entregado", "cancelado"],
  entregado:  [],
  cancelado:  [],
};

const PatchSchema = z.object({
  status: z.enum(["pendiente", "confirmado", "preparando", "en_camino", "entregado", "cancelado"]),
  cancelReason: z.string().max(500).optional(),
});

// ── GET  /api/marketplace/orders/[id] ─────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // SECURITY 2026-05-07 (B5): GET sin allowedRoles permitía que cualquier rol
  // admin (ej. almacenero, repartidor) leyera PII de pedidos marketplace.
  // Igualado a los roles del PATCH: solo admin y manager.
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const dto = await orderRepo.findByIdDto(auth.tenantId, id, { source: "marketplace" });
  if (!dto) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ data: dto });
}

// ── PATCH /api/marketplace/orders/[id] — update status ────────────────────────

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;
  // Round 10 M004: audit log de status transitions con admin actor + IP.
  return runWithAuditContext(req, auth.username, () => patchHandler(req, ctx, auth));
}

async function patchHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  auth: { tenantId: string; username: string },
) {
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  // Leer orden para validar la transición antes de llamar a changeStatus.
  // eslint-disable-next-line no-restricted-properties -- read-only pre-check scoped por tenantId; changeStatus hace el write atómico.
  const order = await prisma.order.findFirst({
    where: { id, source: "marketplace", tenantId: auth.tenantId, deletedAt: null },
  });

  if (!order) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  // Validate status transition
  const allowed = VALID_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(parsed.data.status)) {
    return NextResponse.json(
      { error: `No se puede cambiar de "${order.status}" a "${parsed.data.status}". Válidos: ${allowed.join(", ") || "ninguno (estado final)"}` },
      { status: 422 },
    );
  }

  // CR-1.1: write atómico + historial + comisiones vía MarketplaceOrdersDB.changeStatus.
  // Reemplaza 7 prisma.* directos (findFirst, updateMany, findFirst, historial.create,
  // 2× commissionLedger.updateMany). El método es idempotente y scoped por tenantId.
  const updated = await MarketplaceOrdersDB.changeStatus(
    auth.tenantId,
    id,
    parsed.data.status,
    auth.username,
    parsed.data.cancelReason,
  );
  if (!updated) {
    return NextResponse.json({ error: "Pedido no encontrado o ya modificado" }, { status: 404 });
  }

  // ── Push notification to customer ──────────────────────────────────────

  const STATUS_LABELS: Record<string, { title: string; body: string; emoji: string }> = {
    confirmado: {
      title: "✅ Pedido confirmado",
      body: `Tu pedido ha sido confirmado.`,
      emoji: "✅",
    },
    preparando: {
      title: "👨‍🍳 Estamos preparando tu pedido",
      body: `Tu pedido se está preparando, pronto saldrá a entregarse.`,
      emoji: "👨‍🍳",
    },
    en_camino: {
      title: "🚚 Tu pedido va en camino",
      body: `Tu pedido está en camino.`,
      emoji: "🚚",
    },
    entregado: {
      title: "🎉 ¡Pedido completado!",
      body: `Tu pedido ha sido entregado. ¿Cómo estuvo? Déjanos tu reseña 🌟`,
      emoji: "🎉",
    },
    cancelado: {
      title: "❌ Pedido cancelado",
      body: `Tu pedido fue cancelado.${parsed.data.cancelReason ? ` Motivo: ${parsed.data.cancelReason}` : ""}`,
      emoji: "❌",
    },
  };

  const notification = STATUS_LABELS[parsed.data.status];
  const phone = order.customerPhone;

  if (notification && phone) {
    // Push notification (fire-and-forget)
    sendPushToPhone(phone, {
      title: notification.title,
      body: notification.body,
      url: `/marketplace/orders/${order.id}`,
    }).catch((err) => logger.error("[marketplace/orders/[id]] operation failed", { error: String(err) }));

    // WhatsApp notification (fire-and-forget)
    sendWhatsAppQueued(
      phone,
      `${notification.emoji} *${notification.title}*\n\n${notification.body}\n\n` +
      `📋 Pedido: #${order.id.slice(-8)}\n💰 Total: S/${order.total.toFixed(2)}`,
      { tenantId: auth.tenantId, context: "marketplace-order-status-change" },
    ).catch((err) => logger.error("[marketplace/orders/[id]] whatsapp failed", { error: String(err) }));
  }

  // Log activity (fire-and-forget)
  logActivity(
    "marketplace_order_status_change",
    "Order",
    `Estado cambiado de ${order.status} a ${parsed.data.status}`,
    id,
    auth.username,
  ).catch((err) => logger.error("[marketplace/orders/[id]] operation failed", { error: String(err) }));

  // Comisiones: ya manejadas dentro de MarketplaceOrdersDB.changeStatus (CR-1.1).

  // Auto-coupon "Vuelve pronto" 5% on delivery (fire-and-forget)
  // @prisma-direct ok — coupon.create best-effort scoped por tenantId;
  // migracion a CouponsDB pendiente.
  if (parsed.data.status === "entregado" && phone) {
    const suffix = id.slice(-5).toUpperCase();
    const couponCode = `VUELVE${suffix}`;
    // eslint-disable-next-line no-restricted-properties -- legacy: pre-existing coupon insert con tenantId en payload; migracion a CouponsDB pendiente.
    prisma.coupon.create({
      data: {
        id: crypto.randomUUID(),
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
      sendPushToPhone(phone!, {
        title: "🎁 ¡Tienes un cupón de regalo!",
        body: `Usa el código ${couponCode} y obtén 5% de descuento en tu próxima compra. Válido por 15 días.`,
        url: `/marketplace/orders/${order.id}`,
      }).catch((err) => logger.error("[marketplace/orders/[id]] operation failed", { error: String(err), tenantId: auth.tenantId }));
      sendWhatsAppQueued(
        phone!,
        `🎁 *¡Vuelve pronto!*\n\nGracias por tu compra.\n\n` +
        `🎟️ Usa tu cupón *${couponCode}* para obtener *5% de descuento* en tu próxima compra.\n` +
        `⏰ Válido por 15 días.`,
        { tenantId: auth.tenantId, context: "marketplace-order-return-coupon" },
      ).catch((err) => logger.error("[marketplace/orders/[id]] coupon whatsapp failed", { error: String(err), tenantId: auth.tenantId }));
    }).catch((err) => logger.error("[marketplace/orders/[id]] operation failed", { error: String(err), tenantId: auth.tenantId }));
  }

  return NextResponse.json({
    data: updated,
    message: `Estado actualizado a "${parsed.data.status}"`,
  });
}
