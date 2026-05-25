import { NextRequest, NextResponse } from "next/server";
import { OrdersDB, NotificationLogsDB, ReviewsDB, normalizePhone } from "@/lib/jsondb";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

type TimelineEvent = {
  id: string;
  type: "order" | "notification" | "review" | "sale" | "in-app";
  icon: string;
  title: string;
  detail: string;
  date: string;
  meta?: Record<string, unknown>;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "customers-timeline");
    if (rl) return rl;

    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { phone } = await params;
    const normalized = normalizePhone(phone);

    const [orders, notifications, reviews, sales, inAppNotifs] = await Promise.all([
      OrdersDB.getByCustomerPhone(auth.tenantId, normalized),
      NotificationLogsDB.getByRecipient(normalized, auth.tenantId),
      ReviewsDB.getAll(auth.tenantId).then(all => all.filter(r => r.phone === normalized)),
      // eslint-disable-next-line no-restricted-properties -- legacy: timeline aggregate de 5 fuentes; refactor a CustomersTimelineDB pendiente.
      prisma.sale.findMany({
        where: { tenantId: auth.tenantId, customerPhone: normalized },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      }),
      // eslint-disable-next-line no-restricted-properties -- legacy: idem aggregate timeline.
      prisma.customerNotification.findMany({
        where: { tenantId: auth.tenantId, customerPhone: normalized },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    const events: TimelineEvent[] = [];

    // Orders
    for (const o of orders) {
      const statusLabel: Record<string, string> = {
        pendiente: "Pendiente",
        confirmado: "Confirmado",
        en_camino: "En camino",
        entregado: "Entregado",
        cancelado: "Cancelado",
      };
      events.push({
        id: `order-${o.id}`,
        type: "order",
        icon: o.status === "entregado" ? "check" : o.status === "cancelado" ? "x" : "shopping-bag",
        title: `Pedido — S/${o.total.toFixed(2)}`,
        detail: `${o.items.length} producto${o.items.length > 1 ? "s" : ""} · ${statusLabel[o.status] ?? o.status}`,
        date: o.createdAt,
        meta: { orderId: o.id, status: o.status, total: o.total },
      });
    }

    // Notifications
    for (const n of notifications) {
      const typeLabels: Record<string, string> = {
        order_confirmado: "WhatsApp: Confirmación",
        order_en_camino: "WhatsApp: En camino",
        order_entregado: "WhatsApp: Entregado",
        order_cancelado: "WhatsApp: Cancelado",
        birthday_coupon: "Cupón de cumpleaños",
        promotion: "Promoción",
      };
      events.push({
        id: `notif-${n.id}`,
        type: "notification",
        icon: n.type.startsWith("order_") ? "message-circle" : "bell",
        title: typeLabels[n.type] ?? n.type,
        detail: n.status === "sent" ? "Enviado" : n.status === "link" ? "Link generado" : n.status,
        date: n.createdAt,
      });
    }

    // Reviews
    for (const r of reviews) {
      events.push({
        id: `review-${r.id}`,
        type: "review",
        icon: "star",
        title: `Reseña — ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}`,
        detail: r.text || "Sin comentario",
        date: r.date,
      });
    }

    // POS Sales
    for (const s of sales) {
      events.push({
        id: `sale-${s.id}`,
        type: "sale",
        icon: "shopping-bag",
        title: `Venta POS — S/${s.total.toFixed(2)}`,
        detail: `${s.items.length} producto${s.items.length > 1 ? "s" : ""} · ${s.payment}`,
        date: s.createdAt.toISOString(),
        meta: { saleId: s.id, total: s.total },
      });
    }

    // In-app notifications
    for (const n of inAppNotifs) {
      events.push({
        id: `inapp-${n.id}`,
        type: "in-app",
        icon: "bell",
        title: n.title,
        detail: n.body,
        date: n.createdAt.toISOString(),
      });
    }

    // Sort by date descending
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json(events);

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
