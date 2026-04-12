import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";
import { sendPushToPhone } from "@/lib/push-sender";
import { sendWhatsAppText } from "@/lib/whatsapp";

// ── Valid marketplace order status transitions ────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  pendiente: ["confirmado", "cancelado"],
  confirmado: ["en_camino", "cancelado"],
  en_camino: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

const PatchSchema = z.object({
  status: z.enum(["pendiente", "confirmado", "en_camino", "entregado", "cancelado"]),
  cancelReason: z.string().max(500).optional(),
});

// ── GET  /api/marketplace/orders/[id] ─────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: { id, source: "marketplace", tenantId: auth.tenantId, deletedAt: null },
    include: { items: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      ...order,
      total: Number(order.total),
      couponDiscount: order.couponDiscount != null ? Number(order.couponDiscount) : null,
      discountAmount: order.discountAmount != null ? Number(order.discountAmount) : null,
      totalCogs: order.totalCogs != null ? Number(order.totalCogs) : null,
      items: order.items.map((i) => ({
        ...i,
        price: Number(i.price),
        costPrice: i.costPrice != null ? Number(i.costPrice) : null,
      })),
    },
  });
}

// ── PATCH /api/marketplace/orders/[id] — update status ────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

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

  const updated = await prisma.order.update({
    where: { id },
    data: {
      status: parsed.data.status,
      ...(parsed.data.status === "cancelado" && {
        cancelReason: parsed.data.cancelReason ?? null,
        cancelledAt: new Date(),
      }),
    },
  });

  // Log status change history (fire-and-forget)
  prisma.orderStatusHistory.create({
    data: {
      id: crypto.randomUUID(),
      orderId: id,
      fromStatus: order.status,
      toStatus: parsed.data.status,
      changedBy: auth.username,
      note: parsed.data.cancelReason ?? null,
      tenantId: auth.tenantId,
    },
  }).catch(() => {});

  // ── Push notification to customer ──────────────────────────────────────

  const STATUS_LABELS: Record<string, { title: string; body: string; emoji: string }> = {
    confirmado: {
      title: "✅ Pedido confirmado",
      body: `Tu pedido ha sido confirmado.`,
      emoji: "✅",
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
    }).catch(() => {});

    // WhatsApp notification (fire-and-forget)
    sendWhatsAppText(
      phone,
      `${notification.emoji} *${notification.title}*\n\n${notification.body}\n\n` +
      `📋 Pedido: #${order.id.slice(-8)}\n💰 Total: S/${order.total.toFixed(2)}`
    ).catch(() => {});
  }

  // Log activity (fire-and-forget)
  logActivity(
    "marketplace_order_status_change",
    "Order",
    `Estado cambiado de ${order.status} a ${parsed.data.status}`,
    id,
    auth.username,
  ).catch(() => {});

  // Auto-coupon "Vuelve pronto" 5% on delivery (fire-and-forget)
  if (parsed.data.status === "entregado" && phone) {
    const suffix = id.slice(-5).toUpperCase();
    const couponCode = `VUELVE${suffix}`;
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
      }).catch(() => {});
      sendWhatsAppText(
        phone!,
        `🎁 *¡Vuelve pronto!*\n\nGracias por tu compra.\n\n` +
        `🎟️ Usa tu cupón *${couponCode}* para obtener *5% de descuento* en tu próxima compra.\n` +
        `⏰ Válido por 15 días.`
      ).catch(() => {});
    }).catch(() => {});
  }

  return NextResponse.json({
    data: updated,
    message: `Estado actualizado a "${parsed.data.status}"`,
  });
}
