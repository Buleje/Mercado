import "server-only";
import { ChatThreadsDB, ChatMessagesDB } from "@/lib/db/chat.db";
import { logger } from "@/lib/logger";

/**
 * lib/marketplace-chat.ts — puente pedido → chat marketplace (Messenger).
 *
 * Brandon 2026-06-06 v2: al hacer un pedido, el chat con esa tienda recibe
 * automáticamente el DETALLE completo (items, total, pago, entrega, notas)
 * y la tienda "responde" invitando a coordinar. La conversación nace sola.
 *
 * v2: escribe en el sistema D2 (ConversationThread/ConversationMessage) —
 * el MISMO que lee el ChatTab del panel admin de la tienda. El resumen va
 * como messageType="order_link" con metadataJson {orderId} para que la UI
 * pueda renderizarlo como tarjeta de pedido.
 */

const PHONE_RE = /^9\d{8}$/;

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("51") && cleaned.length === 11) return cleaned.slice(2);
  return cleaned;
}

const PAYMENT_LABELS: Record<string, string> = {
  yape: "Yape",
  plin: "Plin",
  efectivo: "Efectivo contra entrega",
  cash: "Efectivo contra entrega",
  tarjeta: "Tarjeta",
  card: "Tarjeta",
  transferencia: "Transferencia",
  transfer: "Transferencia",
};

export interface OrderChatParams {
  storeId: string;
  storeName: string;
  tenantId: string;
  orderId: string;
  customerPhone: string | null | undefined;
  customerName?: string | null;
  customerAddress?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  total: number;
  items: Array<{ name: string; quantity: number }>;
  scheduledFor?: Date | null;
}

const fmtPEN = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

/**
 * Publica el pedido recién creado en el chat cliente↔tienda.
 * Fire-and-forget friendly: NUNCA lanza (loguea y sigue) — un fallo acá
 * jamás debe romper el checkout.
 */
export async function postOrderToStoreChat(params: OrderChatParams): Promise<void> {
  try {
    const phone = normalizePhone(params.customerPhone ?? "");
    // Pedidos anónimos o con teléfono no-peruano: sin chat (no hay identidad).
    if (!PHONE_RE.test(phone)) return;

    const customerName = params.customerName?.trim() || "Cliente";

    // Thread GENERAL por tienda (orderId=null) — una sola conversación por
    // tienda en la bandeja (UX WhatsApp); el pedido viaja como order_link.
    const thread = await ChatThreadsDB.openOrGet({
      tenantId: params.tenantId,
      storeId: params.storeId,
      customerPhone: phone,
      customerName,
    });

    // ── Mensaje 1 — el CLIENTE "envía" su pedido detallado ─────────────
    const shortId = params.orderId.slice(-6).toUpperCase();
    const itemLines = params.items
      .slice(0, 10)
      .map((it) => `• ${it.quantity}× ${it.name}`)
      .join("\n");
    const moreCount = params.items.length - 10;
    const payLabel =
      PAYMENT_LABELS[(params.paymentMethod ?? "").toLowerCase()] ??
      (params.paymentMethod || "Por coordinar");

    const lines = [
      `Hice un pedido (#${shortId}):`,
      itemLines,
      moreCount > 0 ? `…y ${moreCount} producto${moreCount === 1 ? "" : "s"} más` : null,
      `Total: ${fmtPEN(params.total)}`,
      `Pago: ${payLabel}`,
      params.customerAddress ? `Entrega: ${params.customerAddress}` : null,
      params.scheduledFor
        ? `Programado: ${params.scheduledFor.toLocaleString("es-PE", {
            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
          })}`
        : null,
      params.notes ? `Nota: ${params.notes}` : null,
    ].filter(Boolean);

    await ChatMessagesDB.send({
      tenantId: params.tenantId,
      threadId: thread.id,
      senderType: "buyer",
      senderName: customerName,
      body: lines.join("\n").slice(0, 2000),
      messageType: "order_link",
      metadataJson: JSON.stringify({ orderId: params.orderId, total: params.total }),
    });

    // ── Mensaje 2 — la TIENDA da la bienvenida e invita a conversar ────
    await ChatMessagesDB.send({
      tenantId: params.tenantId,
      threadId: thread.id,
      senderType: "seller",
      senderName: params.storeName,
      body:
        `¡Gracias por tu pedido #${shortId}! Ya lo estamos revisando. ` +
        `¿Alguna indicación extra para prepararlo o entregarlo? Escribinos por acá.`,
    });

    logger.info("[marketplace-chat] order posted to chat", {
      orderId: params.orderId,
      threadId: thread.id,
      storeId: params.storeId,
      tenantId: params.tenantId,
    });
  } catch (err) {
    logger.error("[marketplace-chat] postOrderToStoreChat failed", {
      error: err instanceof Error ? err.message : String(err),
      orderId: params.orderId,
    });
  }
}
